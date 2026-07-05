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
  if (!req.file) return res.status(400).json({ error: '请上传 CSV 文件' });

  const csv = req.file.buffer.toString('utf-8');
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return res.status(400).json({ error: 'CSV 至少需要表头+1行数据' });

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const qIdx = headers.indexOf('question');
  const aIdx = headers.indexOf('expected_answer');
  const tagIdx = headers.indexOf('category_tag');
  if (qIdx < 0 || aIdx < 0) return res.status(400).json({ error: 'CSV 需包含 question 和 expected_answer 列' });

  exp.test_cases = exp.test_cases || [];
  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length <= Math.max(qIdx, aIdx)) continue;
    exp.test_cases.push({
      id: uuidv4(), experiment_id: exp.id,
      question: cols[qIdx] || '', expected_answer: cols[aIdx] || '',
      category_tag: tagIdx >= 0 ? (cols[tagIdx] || '') : '',
    });
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
