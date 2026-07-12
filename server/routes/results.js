const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { data, save, findGroup, findExp } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/groups/:groupId/results', (req, res) => {
  const group = findGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: '实验组不存在' });

  // 找到所属实验
  let exp = null;
  for (const c of data.categories) for (const e of c.experiments) {
    if ((e.groups || []).some((g) => g.id === group.id)) { exp = e; break; }
  }

  const results = (group.evaluation_results || []).map((er) => {
    const tc = exp?.test_cases?.find((t) => t.id === er.test_case_id);
    return { ...er, question: tc?.question || '', expected_answer: tc?.expected_answer || '', category_tag: tc?.category_tag || '' };
  });

  const correctCount = results.filter((r) => r.is_correct).length;
  res.json({
    results, total: results.length, correctCount,
    accuracy: results.length > 0 ? correctCount / results.length : 0,
    avgRuntime: results.length > 0 ? results.reduce((s, r) => s + (r.runtime_ms || 0), 0) / results.length : 0,
    totalTokens: results.reduce((s, r) => s + (r.token_count || 0), 0),
  });
});

router.post('/groups/:groupId/results', (req, res) => {
  const group = findGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: '实验组不存在' });

  let { test_case_id, question, expected_answer, model_response, is_correct, score, runtime_ms, token_count, reason, annotation, think, trajectory } = req.body;

  // 找到所属实验
  let exp = null;
  for (const c of data.categories) for (const e of c.experiments) {
    if ((e.groups || []).some((g) => g.id === group.id)) { exp = e; break; }
  }
  if (!exp) return res.status(404).json({ error: '实验不存在' });

  // 如果没有 test_case_id，但提供了 question，自动创建测试用例
  if (!test_case_id && question) {
    // 先查找是否已有相同题目的测试用例
    const existing = (exp.test_cases || []).find(
      (tc) => tc.question === question && tc.expected_answer === (expected_answer || ''),
    );
    if (existing) {
      test_case_id = existing.id;
    } else {
      const newTc = { id: uuidv4(), experiment_id: exp.id, question, expected_answer: expected_answer || '' };
      exp.test_cases = exp.test_cases || [];
      exp.test_cases.push(newTc);
      test_case_id = newTc.id;
    }
  }

  if (!test_case_id) return res.status(400).json({ error: 'test_case_id 或 question 必填' });

  const result = {
    id: uuidv4(), group_id: group.id, test_case_id,
    model_response: model_response || '', is_correct: is_correct ? 1 : 0,
    score: score ?? (is_correct ? 1 : 0), runtime_ms: runtime_ms || 0, token_count: token_count || 0,
    reason: reason || undefined,
    annotation: annotation || undefined,
    think: think || undefined,
    trajectory: trajectory || undefined,
  };
  group.evaluation_results = group.evaluation_results || [];
  group.evaluation_results.push(result);

  const tc = exp.test_cases?.find((t) => t.id === test_case_id);
  save();
  res.status(201).json({ ...result, question: tc?.question || '', expected_answer: tc?.expected_answer || '', category_tag: tc?.category_tag || '' });
});

router.post('/groups/:groupId/results/upload', upload.single('file'), (req, res) => {
  const group = findGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: '实验组不存在' });
  if (!req.file) return res.status(400).json({ error: '请上传 JSON 文件' });

  let exp = null;
  for (const c of data.categories) for (const e of c.experiments) {
    if ((e.groups || []).some((g) => g.id === group.id)) { exp = e; break; }
  }

  let items;
  try { items = JSON.parse(req.file.buffer.toString('utf-8')); } catch {
    return res.status(400).json({ error: 'JSON 格式错误' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'JSON 应为数组' });

  const testCases = exp?.test_cases || [];
  group.evaluation_results = group.evaluation_results || [];
  let imported = 0;

  for (const r of items) {
    const q = r.question || '';
    const a = r.expected_answer || '';
    let tcId = (testCases).find((tc) => tc.question === q && tc.expected_answer === a)?.id;
    if (!tcId && q) {
      tcId = uuidv4();
      exp.test_cases.push({ id: tcId, experiment_id: exp.id, question: q, expected_answer: a });
      testCases.push(exp.test_cases[exp.test_cases.length - 1]);
    }
    if (!tcId) continue;

    group.evaluation_results.push({
      id: uuidv4(), group_id: group.id, test_case_id: tcId,
      model_response: r.model_response || '',
      is_correct: r.is_correct ? 1 : 0,
      score: r.score ?? (r.is_correct ? 1 : 0),
      runtime_ms: r.runtime_ms || 0,
      token_count: r.token_count || 0,
      trajectory: r.trajectory || undefined,
      custom_scores: r.custom_scores || undefined,
    });
    imported++;
  }
  save();
  res.json({ imported });
});

router.put('/results/:id', (req, res) => {
  for (const c of data.categories) for (const e of c.experiments) for (const g of (e.groups || [])) {
    const er = (g.evaluation_results || []).find((r) => r.id === req.params.id);
    if (er) {
      const { model_response, is_correct, score, runtime_ms, token_count, reason, annotation, think, ai_scores, traj_diagnosis, trajectory } = req.body;
      if (model_response !== undefined) er.model_response = model_response;
      if (is_correct !== undefined) er.is_correct = is_correct ? 1 : 0;
      if (score !== undefined) er.score = score;
      if (runtime_ms !== undefined) er.runtime_ms = runtime_ms;
      if (token_count !== undefined) er.token_count = token_count;
      if (reason !== undefined) er.reason = reason;
      if (annotation !== undefined) er.annotation = annotation;
      if (think !== undefined) er.think = think;
      if (ai_scores !== undefined) er.ai_scores = ai_scores;
      if (traj_diagnosis !== undefined) er.traj_diagnosis = traj_diagnosis;
      if (trajectory !== undefined) er.trajectory = trajectory;
      save();

      const tc = e.test_cases?.find((t) => t.id === er.test_case_id);
      return res.json({ ...er, question: tc?.question || '', expected_answer: tc?.expected_answer || '', category_tag: tc?.category_tag || '' });
    }
  }
  res.status(404).json({ error: '评测结果不存在' });
});

// DELETE 单条评测结果
router.delete('/results/:id', (req, res) => {
  for (const c of data.categories) for (const e of c.experiments) for (const g of (e.groups || [])) {
    const idx = (g.evaluation_results || []).findIndex((r) => r.id === req.params.id);
    if (idx >= 0) { g.evaluation_results.splice(idx, 1); save(); return res.json({ success: true }); }
  }
  res.status(404).json({ error: '评测结果不存在' });
});

module.exports = router;
