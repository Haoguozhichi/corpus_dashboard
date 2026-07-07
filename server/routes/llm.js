const express = require('express');
const llm = require('../llm');

const router = express.Router();

// ====== 配置 ======
router.get('/config', (_req, res) => {
  const cfg = llm.getConfig();
  res.json({ apiUrl: cfg.apiUrl, modelName: cfg.modelName, apiKey: cfg.apiKey ? '***' : '' });
});

// 测试连接（通过后端代理，避免CORS）
router.post('/test-connection', async (req, res) => {
  try {
    const cfg = llm.getConfig();
    const url = req.body.apiUrl || cfg.apiUrl;
    const model = req.body.modelName || cfg.modelName;
    const key = req.body.apiKey !== undefined ? req.body.apiKey : cfg.apiKey;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, model: data.model || model, message: '连接成功' });
    } else {
      const err = await response.text();
      res.json({ success: false, error: `API返回 (${response.status}): ${err.slice(0, 500)}` });
    }
  } catch (err) {
    res.json({ success: false, error: `网络错误: ${err.message}` });
  }
});

router.put('/config', (req, res) => {
  const { apiUrl, modelName, apiKey } = req.body;
  const config = llm.saveConfig({ apiUrl, modelName, apiKey });
  res.json({ apiUrl: config.apiUrl, modelName: config.modelName, apiKey: config.apiKey ? '***' : '' });
});

// ====== 1. 错误诊断 ======
router.post('/diagnose-error', async (req, res) => {
  try {
    const { question, expected_answer, model_response } = req.body;
    if (!question || !expected_answer || !model_response) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const result = await llm.diagnoseError(question, expected_answer, model_response);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== 2. 批量自动标注 ======
router.post('/auto-annotate', async (req, res) => {
  try {
    const { question, expected_answer, model_response } = req.body;
    const scores = await llm.autoAnnotate(question, expected_answer, model_response);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== 3. 错误聚类 ======
router.post('/cluster-errors', async (req, res) => {
  try {
    const { cases } = req.body;
    if (!cases || cases.length === 0) return res.status(400).json({ error: '请提供错误用例' });
    const result = await llm.clusterErrors(cases);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== 4. 对比评析 ======
router.post('/compare-analysis', async (req, res) => {
  try {
    const { question, expected_answer, responseA, correctA, responseB, correctB, nameA, nameB } = req.body;
    const result = await llm.compareAnalysis(question, expected_answer, responseA, correctA, responseB, correctB, nameA, nameB);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== 5. Agent 轨迹诊断 ======
router.post('/diagnose-trajectory', async (req, res) => {
  try {
    const { question, trajectory, is_correct } = req.body;
    const result = await llm.diagnoseTrajectory(question, trajectory, is_correct);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== 7. 实验报告 ======
router.post('/generate-report', async (req, res) => {
  try {
    const { experiment } = req.body;
    const result = await llm.generateReport(experiment);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
