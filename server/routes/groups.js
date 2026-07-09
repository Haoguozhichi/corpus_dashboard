const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { data, save, findExp, findGroup } = require('../db');

const router = express.Router();

router.get('/experiments/:expId/groups', (req, res) => {
  const exp = findExp(req.params.expId);
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
      const correct = results.filter((r) => r.is_correct).length;
      const allResults = g.evaluation_results || [];
      const subCategories = {};
      allResults.forEach((r) => {
        if (r.sub_category) {
          if (!subCategories[r.sub_category]) subCategories[r.sub_category] = { total: 0, correct: 0, tokens: 0 };
          subCategories[r.sub_category].total++;
          if (r.is_correct) subCategories[r.sub_category].correct++;
          subCategories[r.sub_category].tokens += (r.token_count || 0);
        }
      });
      const subStats = Object.entries(subCategories).map(([name, s]) => ({
        name, total: s.total, correct: s.correct,
        accuracy: s.total > 0 ? s.correct / s.total : 0, tokens: s.tokens,
      }));
      return { ...g, parameters: g.parameters || {}, results, resultCount: results.length, correctCount: correct, accuracy: results.length > 0 ? correct / results.length : 0, subCategories: subStats };
    }
    return { ...g, parameters: g.parameters || {} };
  });
  res.json(groups);
});

router.post('/experiments/:expId/groups', (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  const { name, model, eval_dataset, parameters } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const group = { id: uuidv4(), experiment_id: exp.id, name, model: model || '', eval_dataset: eval_dataset || '', parameters: parameters || {}, created_at: new Date().toISOString() };
  exp.groups = exp.groups || [];
  exp.groups.push(group);
  save();
  res.status(201).json(group);
});

router.put('/groups/:id', (req, res) => {
  const group = findGroup(req.params.id);
  if (!group) return res.status(404).json({ error: '实验组不存在' });
  const { name, model, eval_dataset, parameters, error_clusters } = req.body;
  if (name !== undefined) group.name = name;
  if (model !== undefined) group.model = model;
  if (eval_dataset !== undefined) group.eval_dataset = eval_dataset;
  if (parameters !== undefined) group.parameters = parameters;
  if (error_clusters !== undefined) group.error_clusters = error_clusters;
  save();
  res.json(group);
});

router.delete('/groups/:id', (req, res) => {
  for (const c of data.categories) {
    for (const e of c.experiments) {
      const idx = (e.groups || []).findIndex((g) => g.id === req.params.id);
      if (idx >= 0) { e.groups.splice(idx, 1); save(); return res.json({ success: true }); }
    }
  }
  res.status(404).json({ error: '实验组不存在' });
});

module.exports = router;
