const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { data, save, findCat } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = data.categories.map((c) => ({
    id: c.id, name: c.name, description: c.description, created_at: c.created_at,
    experimentCount: (c.experiments || []).length,
  }));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const cat = findCat(req.params.id);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  res.json({ ...cat, experimentCount: (cat.experiments || []).length });
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const cat = { id: uuidv4(), name, description: description || '', created_at: new Date().toISOString(), experiments: [] };
  data.categories.push(cat);
  save();
  res.status(201).json({ id: cat.id, name: cat.name, description: cat.description, created_at: cat.created_at, experimentCount: 0 });
});

router.put('/:id', (req, res) => {
  const cat = findCat(req.params.id);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  const { name, description } = req.body;
  if (name !== undefined) cat.name = name;
  if (description !== undefined) cat.description = description;
  save();
  res.json({ id: cat.id, name: cat.name, description: cat.description, created_at: cat.created_at, experimentCount: (cat.experiments || []).length });
});

router.delete('/:id', (req, res) => {
  const idx = data.categories.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '类别不存在' });
  data.categories.splice(idx, 1);
  save();
  res.json({ success: true });
});

module.exports = router;
