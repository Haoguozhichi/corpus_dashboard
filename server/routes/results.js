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

  let { test_case_id, question, expected_answer, model_response, is_correct, score, runtime_ms, token_count, trajectory, custom_scores, conversations } = req.body;

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
    trajectory: trajectory || undefined,
    custom_scores: custom_scores || undefined,
    conversations: conversations || undefined,
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
  if (!req.file) return res.status(400).json({ error: '请上传 CSV 文件' });

  let exp = null;
  for (const c of data.categories) for (const e of c.experiments) {
    if ((e.groups || []).some((g) => g.id === group.id)) { exp = e; break; }
  }

  const csv = req.file.buffer.toString('utf-8');
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return res.status(400).json({ error: 'CSV 至少需要表头+1行数据' });

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const qIdx = headers.indexOf('question');
  const aIdx = headers.indexOf('expected_answer');
  const rIdx = headers.indexOf('model_response');
  const cIdx = headers.indexOf('is_correct');
  const sIdx = headers.indexOf('score');
  const rtIdx = headers.indexOf('runtime_ms');
  const tkIdx = headers.indexOf('token_count');
  const tjIdx = headers.indexOf('trajectory');
  const csIdx = headers.indexOf('custom_scores');

  if (rIdx < 0) return res.status(400).json({ error: 'CSV 需包含 model_response 列' });

  const testCases = exp?.test_cases || [];
  group.evaluation_results = group.evaluation_results || [];
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length <= Math.max(rIdx, 0)) continue;

    let tcId = null;
    const q = qIdx >= 0 ? cols[qIdx] : '';
    const a = aIdx >= 0 ? cols[aIdx] : '';

    // 尝试匹配已有测试用例
    if (qIdx >= 0) {
      const match = testCases.find((tc) => tc.question === q && tc.expected_answer === a);
      if (match) tcId = match.id;
    }
    // 按行号匹配（兼容旧格式）
    if (!tcId && i - 1 < testCases.length) tcId = testCases[i - 1].id;
    // 自动创建不存在的测试用例
    if (!tcId && q) {
      const newTc = { id: uuidv4(), experiment_id: exp.id, question: q, expected_answer: a };
      exp.test_cases.push(newTc);
      testCases.push(newTc);
      tcId = newTc.id;
    }
    if (!tcId) continue;

    const resultEntry = {
      id: uuidv4(), group_id: group.id, test_case_id: tcId,
      model_response: cols[rIdx] || '',
      is_correct: cIdx >= 0 ? (cols[cIdx] === '1' || cols[cIdx] === 'true' ? 1 : 0) : 0,
      score: sIdx >= 0 ? (parseFloat(cols[sIdx]) || 0) : (cIdx >= 0 && cols[cIdx] === '1' ? 1.0 : 0.0),
      runtime_ms: rtIdx >= 0 ? (parseInt(cols[rtIdx]) || 0) : 0,
      token_count: tkIdx >= 0 ? (parseInt(cols[tkIdx]) || 0) : 0,
    };
    if (tjIdx >= 0 && cols[tjIdx]) {
      try { resultEntry.trajectory = JSON.parse(cols[tjIdx]); } catch { resultEntry.trajectory = cols[tjIdx]; }
    }
    if (csIdx >= 0 && cols[csIdx]) {
      try { resultEntry.custom_scores = JSON.parse(cols[csIdx]); } catch { /* skip */ }
    }
    group.evaluation_results.push(resultEntry);
    imported++;
  }
  save();
  res.json({ imported });
});

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

router.put('/results/:id', (req, res) => {
  for (const c of data.categories) for (const e of c.experiments) for (const g of (e.groups || [])) {
    const er = (g.evaluation_results || []).find((r) => r.id === req.params.id);
    if (er) {
      const { model_response, is_correct, score, runtime_ms, token_count, trajectory, custom_scores, conversations } = req.body;
      if (model_response !== undefined) er.model_response = model_response;
      if (is_correct !== undefined) er.is_correct = is_correct ? 1 : 0;
      if (score !== undefined) er.score = score;
      if (runtime_ms !== undefined) er.runtime_ms = runtime_ms;
      if (token_count !== undefined) er.token_count = token_count;
      if (trajectory !== undefined) er.trajectory = trajectory;
      if (custom_scores !== undefined) er.custom_scores = custom_scores;
      if (conversations !== undefined) er.conversations = conversations;
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
