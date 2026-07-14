# 📊 实验数据展示平台

一个用于管理和对比 AI 实验结果的 Web 平台，支持**评测实验**和 **Agent 评测**（通过轨迹数据自动识别）。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| UI 组件库 | Ant Design 6 |
| 图表 | Recharts 3 |
| 路由 | React Router 7 |
| 构建工具 | Vite 8 |
| 后端 | Express 4 |
| 数据存储 | SQLite (`server/data.sqlite`, sql.js WASM) |

## 快速启动

```bash
npm install
npm run dev
```

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3001`
- `npm run dev` 通过 concurrently 同时启动前后端
- 前端通过 Vite 代理将 `/api` 请求转发到后端，无需跨域配置

## 项目结构

```
corpus_dashboard/
├── server/
│   ├── index.js                 # Express 入口 (port 3001)
│   ├── db.js                    # SQLite 数据库 + Seed 数据
│   ├── data.sqlite              # 持久化数据库（删除后重启自动重建 seed）
│   └── routes/
│       ├── experiments.js       # 实验 API
│       ├── groups.js            # 实验组 API
│       ├── metrics.js           # 训练指标 API
│       ├── testCases.js         # 测试用例 API
│       └── results.js           # 评测结果 API
├── src/
│   ├── api/
│   │   ├── client.ts            # fetch 封装
│   │   └── endpoints.ts         # API 端点定义
│   ├── types/index.ts           # TypeScript 类型
│   ├── context/DataContext.tsx   # 全局状态管理
│   ├── components/
│   │   ├── AppLayout.tsx         # 布局 + 面包屑导航
│   │   ├── EvaluationDetail.tsx  # 评测实验组详情
│   │   ├── AgentEvaluationDetail.tsx # Agent评测详情
│   │   ├── TrajectoryViewer.tsx  # 轨迹时间线
│   │   ├── CustomScoresChart.tsx # 多维评分图
│   │   ├── ResultsUploader.tsx   # 评测结果管理（可编辑表格+JSON上传）
│   │   ├── GroupFormModal.tsx     # 实验组表单
│   │   ├── ExperimentFormModal.tsx # 实验表单
│   │   ├── BulkImport.tsx        # 一键导入组件
│   └── pages/
│       ├── HomePage.tsx          # 首页 - 全实验列表+筛选+创建
│       ├── DashboardPage.tsx     # 仪表盘 - 实验组对比表+管理
│       ├── DetailPage.tsx        # 实验组详情
│       └── ComparePage.tsx       # 多组对比分析
├── package.json
├── vite.config.ts
└── index.html
```

## 数据模型

### 层级关系

```
实验 (Experiment) × N
  ├── 实验组 (ExperimentGroup) × N
  │     └── evaluation_results × N
  └── 测试用例 (TestCase) × N
```

### 实验类型（统一为 evaluation）

所有实验类型统一为 `evaluation`。平台根据数据特征自动识别展示模式：

| 数据特征 | 展示模式 |
|---------|---------|
| 含 `trajectory` 字段 | Agent 风格（轨迹时间线 + 工具调用统计） |
| 含 `training_metrics` | 训练风格（指标对比 + Loss/Accuracy 曲线） |
| 无特殊字段 | 标准评测风格（题目→答案→正确性） |

### 核心类型定义

```typescript
// 评测结果
interface EvaluationResult {
  id: string;
  groupId: string;
  test_case_id: string;
  model_response: string;
  is_correct: number;       // 0=错误, 1=正确
  score: number;            // 得分 (0~1)
  runtime_ms: number;       // 执行耗时(毫秒)
  token_count: number;      // Token 消耗
  reason?: string;          // 正确性判断原因
  annotation?: string;      // 人工标注
  think?: string;           // 模型思考过程

  // Agent 评测专用 (可选)
  trajectory?: TrajectoryStep[];
  custom_scores?: Record<string, number>;

  // JOIN 字段 (后端自动填充)
  question?: string;
  expected_answer?: string;
}

// Agent 轨迹步骤
interface TrajectoryStep {
  step: number;
  thought?: string;         // 思考过程
  action?: string;          // 执行动作
  observation?: string;     // 观察结果
  tool?: string;            // 使用的工具名
  tool_input?: string;      // 工具输入
  tool_output?: string;     // 工具输出
}

// 训练指标
interface TrainingMetrics {
  id: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  token_count: number;
  runtime: number;
  loss_curve: number[];
  accuracy_curve: number[];
  custom_metrics?: Record<string, number>;  // 自定义指标
}
```

## 使用指南

### 1. 创建实验

首页 → 点击「创建实验」→ 填写名称、描述、负责人、日期

### 2. 管理实验数据

进入实验 → 点击「管理实验组」→ 表格中直接编辑所有实验组的名称、模型、评测集和变量，支持添加/删除实验组和变量列

### 3. 导入/导出

- **一键导入 JSON**：上传含实验组、变量、评测结果的 JSON 文件
- **导出 JSON**：点击「导出」按钮下载整个实验数据为 JSON 文件

### 4. 评测详情

点击实验组行进入详情页，查看题目/标准答案/模型回答对比表。

- 点击「管理评测结果」批量编辑结果，支持添加/删除行和自定义列
- 支持列排序、筛选、文本搜索
- Agent 实验支持轨迹时间线展示和 AI 轨迹诊断

### 5. 对比分析

仪表盘 → 勾选**多个**实验组 → 点击「对比选中组」

- 动态指标选择器，每个指标一张小柱状图（按实验组颜色区分）
- 变量差异表 + 共同用例回答对比
- 支持 AI 对比评析

## JSON 批量导入格式

所有数据导入统一使用 JSON 格式。

### 一键导入（推荐）

一个 JSON 文件包含实验组、变量、评测结果，适用于所有实验类型。

#### 训练实验

```json
[{
  "group_name": "ResNet-50",
  "model": "ResNet-50",
  "variables": { "lr": 0.1, "batch_size": 256 },
  "metrics": {
    "accuracy": 0.761, "precision": 0.758, "recall": 0.764, "f1_score": 0.761,
    "runtime": 32400, "token_count": 0,
    "loss_curve": [2.8, 2.3, 1.9, 1.6, 1.4],
    "accuracy_curve": [0.15, 0.32, 0.45, 0.55, 0.63],
    "custom_metrics": { "top5_accuracy": 0.95 }
  }
}]
```

#### 评测实验

| 字段 | 必填 | 说明 |
|------|:--:|------|
| group_name | ✅ | 实验组名称 |
| model | | 模型名 |
| eval_dataset | | 评测集名称 |
| variables | | 实验变量键值对 |
| results[].question | ✅ | 题目 |
| results[].expected_answer | | 标准答案 |
| results[].model_response | | 模型回答 |
| results[].is_correct | | 是否正确 (true/false) |
| results[].score | | 得分 (0~1) |
| results[].runtime_ms | | 耗时(毫秒) |
| results[].token_count | | Token 数 |
| results[].reason | | 正确性判断原因 |
| results[].annotation | | 人工标注 |
| results[].think | | 模型思考过程 |

#### Agent 评测

在上表基础上，results 额外支持：

| 字段 | 说明 |
|------|------|
| trajectory | 执行轨迹数组 `[{"step":1,"thought":"...","action":"..."}]` |
| custom_scores | 多维评分 `{"tool_accuracy":0.9,"reasoning":0.8}` |

### 测试用例 JSON 批量上传

```json
[
  { "question": "法国首都是哪里？", "expected_answer": "巴黎", "category_tag": "知识问答" },
  { "question": "计算 123 * 456", "expected_answer": "56088" }
]
```

### 评测结果 JSON 批量上传

```json
[
  { "question": "...", "expected_answer": "...", "model_response": "...", "is_correct": true, "score": 1.0, "runtime_ms": 190, "token_count": 25 }
]
```

### LLM 集成（AI 分析）

平台内置 LLM 调用模块，支持 OpenAI-compatible API（DeepSeek、本地模型等）。
在顶部导航栏 **「LLM」按钮** 中配置 API 地址、模型名称和 API Key 后即可使用。

| 功能 | 位置 | 说明 |
|------|------|------|
| **AI 错误诊断** | 评测详情 → AI 分析下拉 | 勾选错误用例，LLM 诊断原因，自动填入 `reason` 列 |
| **AI 错误聚类** | 评测详情 → AI 分析下拉 | 对所有错误用例聚类分析，结果保存到实验组并展示 |
| **AI 对比评析** | 对比分析页 | 分析两组回答差异 |
| **AI 轨迹诊断** | Agent 详情 → 轨迹弹窗 | 诊断 Agent 执行轨迹 |
| **AI 实验报告** | 仪表盘 → AI 报告 | 自动生成实验报告（首次生成，再次点击直接查看） |

所有 AI 分析结果持久化到数据库，刷新不丢失。

### Mock 数据文件

项目根目录提供了三个示例 JSON 文件用于测试一键导入：

| 文件 | 实验组数 | 用例数 |
|------|---------|--------|
| `sample_training.json` | 6 | — |
| `sample_evaluation.json` | 6 | 每12条, 共72条 |
| `sample_agent.json` | 5 | 每12条(含轨迹), 共60条 |

### Claude Code Skill：实验数据格式转换

项目包含一个 Claude Code Skill（`experiment-json-converter/`），可将任意格式（CSV、Excel、JSON、Markdown 表格、纯文本）的实验数据自动转换为平台的一键导入 JSON 格式。

**使用方式**：在 Claude Code 中描述你的实验数据，Skill 会自动识别实验类型、映射字段、生成 JSON 文件。

```
示例：我有一个 results.csv，包含 model, question, answer, correct 四列...
```

## API 接口一览

### 实验
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experiments` | 列表 |
| GET | `/api/experiments/:id` | 详情(含实验组和结果) |
| POST | `/api/experiments` | 创建 |
| POST | `/api/experiments/:expId/import` | 一键导入 JSON |
| PUT | `/api/experiments/:id` | 更新 |
| DELETE | `/api/experiments/:id` | 删除 |

### 实验组
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experiments/:expId/groups` | 列表 |
| POST | `/api/experiments/:expId/groups` | 创建 |
| PUT | `/api/groups/:id` | 更新 |
| DELETE | `/api/groups/:id` | 删除 |

### 训练指标
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/groups/:groupId/metrics` | 获取 |
| PUT | `/api/groups/:groupId/metrics` | 创建/更新(upsert) |

### 测试用例
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experiments/:expId/test-cases` | 列表 |
| POST | `/api/experiments/:expId/test-cases` | 逐条创建 |
| POST | `/api/experiments/:expId/test-cases/upload` | JSON 批量上传 |
| PUT | `/api/test-cases/:id` | 更新 |
| DELETE | `/api/test-cases/:id` | 删除（级联删除关联评测结果） |

### 评测结果
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/groups/:groupId/results` | 列表(含汇总统计) |
| POST | `/api/groups/:groupId/results` | 逐条创建 |
| POST | `/api/groups/:groupId/results/upload` | JSON 批量上传 |
| PUT | `/api/results/:id` | 更新 |
| DELETE | `/api/results/:id` | 删除 |

## 数据重置

删除数据库文件后重启即可恢复 seed 数据：

```bash
rm server/data.sqlite
npm run dev
```
