const express = require('express');
const cors = require('cors');
const path = require('path');

const categoriesRouter = require('./routes/categories');
const experimentsRouter = require('./routes/experiments');
const groupsRouter = require('./routes/groups');
const metricsRouter = require('./routes/metrics');
const testCasesRouter = require('./routes/testCases');
const resultsRouter = require('./routes/results');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 路由
app.use('/api/categories', categoriesRouter);
app.use('/api/experiments', experimentsRouter);
app.use('/api', groupsRouter);
app.use('/api', metricsRouter);
app.use('/api', testCasesRouter);
app.use('/api', resultsRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 实验数据平台后端已启动: http://localhost:${PORT}`);
});
