const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { data, save, findExp } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/experiments/:expId/test-cases', (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  res.json(exp.test_cases || []);
});

router.post('/experiments/:expId/test-cases', (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  const { question, expected_answer, category_tag } = req.body;
  if (!question) return res.status(400).json({ error: '题目不能为空' });
  const tc = { id: uuidv4(), experiment_id: exp.id, question, expected_answer: expected_answer || '', category_tag: category_tag || '' };
  exp.test_cases = exp.test_cases || [];
  exp.test_cases.push(tc);
  save();
  res.status(201).json(tc);
});

router.post('/experiments/:expId/test-cases/upload', upload.single('file'), (req, res) => {
  const exp = findExp(req.params.expId);
  if (!exp) return res.status(404).json({ error: '实验不存在' });
  if (!req.file) return res.status(400).json({ error: '请上传 JSON 文件' });

  let items;
  try { items = JSON.parse(req.file.buffer.toString('utf-8')); } catch {
    return res.status(400).json({ error: 'JSON 格式错误' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'JSON 应为数组，至少包含一个元素' });

  exp.test_cases = exp.test_cases || [];
  let imported = 0;
  for (const item of items) {
    if (!item.question) continue;
    exp.test_cases.push({
      id: uuidv4(), experiment_id: exp.id,
      question: item.question,
      expected_answer: item.expected_answer || '',
      category_tag: item.category_tag || '',
    });
    imported++;
  }
  save();
  res.json({ imported });
});

router.put('/test-cases/:id', (req, res) => {
  for (const c of data.categories) {
    for (const e of c.experiments) {
      const tc = (e.test_cases || []).find((t) => t.id === req.params.id);
      if (tc) {
        const { question, expected_answer, category_tag } = req.body;
        if (question !== undefined) tc.question = question;
        if (expected_answer !== undefined) tc.expected_answer = expected_answer;
        if (category_tag !== undefined) tc.category_tag = category_tag;
        save();
        return res.json(tc);
      }
    }
  }
  res.status(404).json({ error: '测试用例不存在' });
});

router.delete('/test-cases/:id', (req, res) => {
  for (const c of data.categories) {
    for (const e of c.experiments) {
      const idx = (e.test_cases || []).findIndex((t) => t.id === req.params.id);
      if (idx >= 0) {
        e.test_cases.splice(idx, 1);
        // 级联删除：清理所有实验组中引用该测试用例的评测结果
        for (const g of (e.groups || [])) {
          g.evaluation_results = (g.evaluation_results || []).filter(
            (r) => r.test_case_id !== req.params.id,
          );
        }
        save();
        return res.json({ success: true });
      }
    }
  }
  res.status(404).json({ error: '测试用例不存在' });
});

module.exports = router;
