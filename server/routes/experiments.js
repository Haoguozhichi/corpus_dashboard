const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { data, save, findCat, findExp } = require('../db');

const router = express.Router();

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

module.exports = router;
