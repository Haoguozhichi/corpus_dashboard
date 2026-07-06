const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { data, save, findCat, findExp } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
      const results = (g.evaluation_results || []).map((er) => {
        const tc = exp.test_cases?.find((t) => t.id === er.test_case_id);
        return { ...er, question: tc?.question || '', expected_answer: tc?.expected_answer || '', category_tag: tc?.category_tag || '' };
      });
      const correctCount = results.filter((r) => r.is_correct).length;
      return { ...g, parameters: g.parameters || {}, results, resultCount: results.length, correctCount, accuracy: results.length > 0 ? correctCount / results.length : 0 };
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

// POST 一键导入：CSV 中含实验组信息和评测结果
router.post('/:expId/import', upload.single('file'), (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  if (!req.file) return res.status(400).json({ error: '请上传 CSV 文件' });

  const csv = req.file.buffer.toString('utf-8');
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return res.status(400).json({ error: 'CSV 至少需要表头+1行数据' });

  const headers = lines[0].split(',').map((h) => h.trim());

  // 识别列
  const idx = (name) => headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const groupNameIdx = idx('group_name');
  const modelIdx = idx('model');
  const questionIdx = idx('question');
  const answerIdx = idx('expected_answer');
  const respIdx = idx('model_response');
  const correctIdx = idx('is_correct');
  const scoreIdx = idx('score');
  const runtimeIdx = idx('runtime_ms');
  const tokenIdx = idx('token_count');
  const trajIdx = idx('trajectory');
  const scoresIdx = idx('custom_scores');

  if (groupNameIdx < 0) return res.status(400).json({ error: 'CSV 需包含 group_name 列（实验组名称）' });
  if (questionIdx < 0) return res.status(400).json({ error: 'CSV 需包含 question 列' });

  // 找出哪些列是组变量（不在已知结果列中的）
  const knownCols = new Set(['group_name', 'model', 'question', 'expected_answer', 'model_response', 'is_correct', 'score', 'runtime_ms', 'token_count', 'trajectory', 'custom_scores']);
  const paramCols = headers.filter((h) => !knownCols.has(h.toLowerCase()));

  // 按 group_name 分组
  const groupMap = {};
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < headers.length) continue;
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (cols[j] || '').trim(); });
    const gName = row['group_name'];
    if (!gName) continue;
    if (!groupMap[gName]) {
      groupMap[gName] = {
        model: row['model'] || '',
        params: {},
        rows: [],
      };
      paramCols.forEach((p) => {
        const val = row[p];
        if (val !== undefined && val !== '') {
          groupMap[gName].params[p] = isNaN(Number(val)) ? val : Number(val);
        }
      });
    }
    groupMap[gName].rows.push(row);
  }

  exp.groups = exp.groups || [];
  exp.test_cases = exp.test_cases || [];
  let groupsCreated = 0;
  let resultsCreated = 0;

  for (const [gName, gData] of Object.entries(groupMap)) {
    // 创建实验组
    const gid = uuidv4();
    exp.groups.push({
      id: gid, experiment_id: exp.id, name: gName, model: gData.model,
      parameters: gData.params, created_at: new Date().toISOString(),
    });

    // 创建评测结果
    const evalResults = [];
    for (const row of gData.rows) {
      const q = row['question'] || '';
      const a = row['expected_answer'] || '';
      let tcId = (exp.test_cases || []).find((tc) => tc.question === q && tc.expected_answer === a)?.id;
      if (!tcId && q) {
        tcId = uuidv4();
        exp.test_cases.push({ id: tcId, experiment_id: exp.id, question: q, expected_answer: a });
      }
      if (!tcId) continue;

      let trajectory, custom_scores;
      if (trajIdx >= 0 && row['trajectory']) {
        try { trajectory = JSON.parse(row['trajectory']); } catch { /* skip */ }
      }
      if (scoresIdx >= 0 && row['custom_scores']) {
        try { custom_scores = JSON.parse(row['custom_scores']); } catch { /* skip */ }
      }

      evalResults.push({
        id: uuidv4(), group_id: gid, test_case_id: tcId,
        model_response: respIdx >= 0 ? (row['model_response'] || '') : '',
        is_correct: correctIdx >= 0 ? (row['is_correct'] === '1' || row['is_correct'] === 'true' ? 1 : 0) : 0,
        score: scoreIdx >= 0 ? (parseFloat(row['score']) || 0) : (correctIdx >= 0 && row['is_correct'] === '1' ? 1 : 0),
        runtime_ms: runtimeIdx >= 0 ? (parseInt(row['runtime_ms']) || 0) : 0,
        token_count: tokenIdx >= 0 ? (parseInt(row['token_count']) || 0) : 0,
        trajectory, custom_scores,
      });
    }
    exp.groups[exp.groups.length - 1].evaluation_results = evalResults;
    groupsCreated++;
    resultsCreated += evalResults.length;
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
