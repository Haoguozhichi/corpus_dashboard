const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { data, save, findCat, findExp } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const { categoryId } = req.query;
  let exps = [];
  if (categoryId) {
    const cat = findCat(categoryId);
    if (cat) exps = cat.experiments || [];
  } else {
    for (const c of data.categories) exps.push(...(c.experiments || []));
  }
  const rows = exps.map((e) => ({
    id: e.id, category_id: e.category_id, name: e.name, description: e.description,
    type: e.type, date: e.date, created_at: e.created_at,
    groupCount: (e.groups || []).length,
  }));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const exp = findExp(req.params.id);
  if (!exp) return res.status(404).json({ error: '实验不存在' });

  const groups = (exp.groups || []).map((g) => {
    if (exp.type === 'training') {
      const m = g.training_metrics;
      return { ...g, parameters: g.parameters || {}, metrics: m ? { ...m, loss_curve: m.loss_curve || [], accuracy_curve: m.accuracy_curve || [] } : null };
    } else if (exp.type === 'evaluation' || exp.type === 'agent_evaluation') {
      const allResults = g.evaluation_results || [];
      const correctCount = allResults.filter((r) => r.is_correct).length;
      const totalTokens = allResults.reduce((s, r) => s + (r.token_count || 0), 0);
      const avgRuntime = allResults.length > 0 ? allResults.reduce((s, r) => s + (r.runtime_ms || 0), 0) / allResults.length : 0;
      // 只返回摘要，不返回全量结果（可通过 /api/groups/:groupId/results 获取详情）
      const preview = allResults.slice(0, 100).map((er) => {
        const tc = exp.test_cases?.find((t) => t.id === er.test_case_id);
        return { ...er, question: tc?.question || '', expected_answer: tc?.expected_answer || '', category_tag: tc?.category_tag || '' };
      });
      return { ...g, parameters: g.parameters || {}, results: preview, resultCount: allResults.length, correctCount, accuracy: allResults.length > 0 ? correctCount / allResults.length : 0, totalTokens, avgRuntime };
    }
    return { ...g, parameters: g.parameters || {} };
  });

  const testCases = exp.test_cases || [];

  res.json({ ...exp, groups, testCases });
});

router.post('/', (req, res) => {
  const { categoryId, name, description, type, date } = req.body;
  if (!categoryId || !name || !type || !date) return res.status(400).json({ error: 'categoryId, name, type, date 为必填' });
  const cat = findCat(categoryId);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  const exp = { id: uuidv4(), category_id: categoryId, name, description: description || '', type, date, created_at: new Date().toISOString(), groups: [], test_cases: [] };
  cat.experiments.push(exp);
  save();
  res.status(201).json({ id: exp.id, category_id: exp.category_id, name: exp.name, description: exp.description, type: exp.type, date: exp.date, created_at: exp.created_at, groupCount: 0 });
});

router.put('/:id', (req, res) => {
  const exp = findExp(req.params.id);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  const { name, description, type, date } = req.body;
  if (name !== undefined) exp.name = name;
  if (description !== undefined) exp.description = description;
  if (type !== undefined) exp.type = type;
  if (date !== undefined) exp.date = date;
  save();
  res.json(exp);
});

router.delete('/:id', (req, res) => {
  for (const c of data.categories) {
    const idx = c.experiments.findIndex((e) => e.id === req.params.id);
    if (idx >= 0) { c.experiments.splice(idx, 1); save(); return res.json({ success: true }); }
  }
  res.status(404).json({ error: '实验不存在' });
});

// POST 一键导入：JSON 格式包含实验组信息和数据
router.post('/:expId/import', upload.single('file'), (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  if (!req.file) return res.status(400).json({ error: '请上传 JSON 文件' });

  let groupsData;
  try { groupsData = JSON.parse(req.file.buffer.toString('utf-8')); } catch {
    return res.status(400).json({ error: 'JSON 格式错误' });
  }
  if (!Array.isArray(groupsData) || groupsData.length === 0) {
    return res.status(400).json({ error: 'JSON 应为实验组数组' });
  }

  exp.groups = exp.groups || [];
  exp.test_cases = exp.test_cases || [];
  let groupsCreated = 0, resultsCreated = 0;

  // 训练类型
  if (exp.type === 'training') {
    for (const gData of groupsData) {
      if (!gData.group_name) continue;
      const gid = uuidv4();
      const m = gData.metrics || {};
      exp.groups.push({
        id: gid, experiment_id: exp.id, name: gData.group_name,
        model: gData.model || '', parameters: gData.variables || {}, created_at: new Date().toISOString(),
        training_metrics: {
          id: uuidv4(),
          accuracy: m.accuracy ?? 0, precision: m.precision ?? 0,
          recall: m.recall ?? 0, f1_score: m.f1_score ?? 0,
          token_count: m.token_count ?? 0, runtime: m.runtime ?? 0,
          loss_curve: m.loss_curve || [], accuracy_curve: m.accuracy_curve || [],
          custom_metrics: m.custom_metrics || {},
        },
      });
      groupsCreated++;
    }
  } else {
    // 评测 / Agent 评测类型
    for (const gData of groupsData) {
      if (!gData.group_name) continue;
      const gid = uuidv4();
      exp.groups.push({
        id: gid, experiment_id: exp.id, name: gData.group_name,
        model: gData.model || '', parameters: gData.variables || {}, created_at: new Date().toISOString(),
      });
      const evalResults = [];
      for (const r of (gData.results || [])) {
        const q = r.question || '', a = r.expected_answer || '';
        let tcId = (exp.test_cases || []).find((tc) => tc.question === q && tc.expected_answer === a)?.id;
        if (!tcId && q) { tcId = uuidv4(); exp.test_cases.push({ id: tcId, experiment_id: exp.id, question: q, expected_answer: a }); }
        if (!tcId) continue;
        evalResults.push({
          id: uuidv4(), group_id: gid, test_case_id: tcId,
          model_response: r.model_response || '', is_correct: r.is_correct ? 1 : 0,
          score: r.score ?? (r.is_correct ? 1 : 0), runtime_ms: r.runtime_ms || 0, token_count: r.token_count || 0,
          reason: r.reason || undefined,
          trajectory: r.trajectory || undefined, custom_scores: r.custom_scores || undefined,
        });
      }
      exp.groups[exp.groups.length - 1].evaluation_results = evalResults;
      groupsCreated++;
      resultsCreated += evalResults.length;
    }
  }

  save();
  res.json({ groupsCreated, resultsCreated, testCasesCreated: exp.test_cases.length });
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

module.exports = router;
