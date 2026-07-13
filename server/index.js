const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db');

const categoriesRouter = require('./routes/categories');
const experimentsRouter = require('./routes/experiments');
const groupsRouter = require('./routes/groups');
const metricsRouter = require('./routes/metrics');
const testCasesRouter = require('./routes/testCases');
const resultsRouter = require('./routes/results');
const llmRouter = require('./routes/llm');

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
app.use('/api/llm', llmRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 初始化数据库（加载 SQLite WASM → 加载/迁移数据）→ 启动服务
init().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 实验数据平台后端已启动: http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('❌ 数据库初始化失败:', err);
  process.exit(1);
});
