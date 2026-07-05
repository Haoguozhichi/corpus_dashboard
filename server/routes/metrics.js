const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { data, save, findGroup } = require('../db');

const router = express.Router();

router.get('/groups/:groupId/metrics', (req, res) => {
  const group = findGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: '实验组不存在' });
  const m = group.training_metrics;
  if (!m) return res.json(null);
  res.json({ ...m, loss_curve: m.loss_curve || [], accuracy_curve: m.accuracy_curve || [], custom_metrics: m.custom_metrics || {} });
});

router.put('/groups/:groupId/metrics', (req, res) => {
  const group = findGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: '实验组不存在' });

  const existing = group.training_metrics;
  const { accuracy, precision, recall, f1_score, token_count, runtime, loss_curve, accuracy_curve, custom_metrics } = req.body;

  const metrics = {
    id: existing?.id || uuidv4(),
    accuracy: accuracy ?? existing?.accuracy ?? 0,
    precision: precision ?? existing?.precision ?? 0,
    recall: recall ?? existing?.recall ?? 0,
    f1_score: f1_score ?? existing?.f1_score ?? 0,
    token_count: token_count ?? existing?.token_count ?? 0,
    runtime: runtime ?? existing?.runtime ?? 0,
    loss_curve: loss_curve ?? existing?.loss_curve ?? [],
    accuracy_curve: accuracy_curve ?? existing?.accuracy_curve ?? [],
    custom_metrics: custom_metrics ?? existing?.custom_metrics ?? {},
  };
  group.training_metrics = metrics;
  save();
  res.json(metrics);
});

module.exports = router;
