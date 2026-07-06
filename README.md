# 📊 实验数据展示平台

一个用于管理和对比 AI 实验结果的 Web 平台，支持**训练实验**、**评测实验**和 **Agent 评测**三种实验类型。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| UI 组件库 | Ant Design 6 |
| 图表 | Recharts 3 |
| 路由 | React Router 7 |
| 构建工具 | Vite 8 |
| 后端 | Express 4 |
| 数据存储 | JSON 文件 (`server/data.json`) |

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
│   ├── db.js                    # JSON 数据库 + Seed 数据
│   ├── data.json                # 持久化数据（删除后重启自动重建 seed）
│   └── routes/
│       ├── categories.js        # 实验类别 API
│       ├── experiments.js       # 实验 API
│       ├── groups.js            # 实验组 API
│       ├── metrics.js           # 训练指标 API
│       ├── testCases.js         # 测试用例 API (含 CSV 上传)
│       └── results.js           # 评测结果 API (含 CSV 上传)
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
│   │   ├── ResultsUploader.tsx   # 评测结果管理（上传+逐条+删除）
│   │   ├── TrainingMetricsManager.tsx # 训练指标统一管理
│   │   ├── TestCaseTable.tsx     # 测试用例可编辑表格
│   │   ├── JsonUploader.tsx      # JSON 批量上传组件
│   │   └── BulkImport.tsx        # 一键导入组件
│   └── pages/
│       ├── HomePage.tsx          # 首页 - 实验类别卡片
│       ├── ExperimentListPage.tsx # 实验列表
│       ├── DashboardPage.tsx     # 仪表盘 - 实验组对比表
│       ├── DetailPage.tsx        # 实验组详情（类型自适应路由）
│       └── ComparePage.tsx       # 对比分析
├── package.json
├── vite.config.ts
└── index.html
```

## 数据模型

### 层级关系

```
实验类别 (Category)
  └── 实验 (Experiment) × N
        ├── 类型: training | evaluation | agent_evaluation | other
        │
        ├── 实验组 (ExperimentGroup) × N
        │     ├── training_metrics — 仅 training 类型
        │     └── evaluation_results × N — evaluation / agent_evaluation 类型
        │
        └── 测试用例 (TestCase) × N — evaluation / agent_evaluation 类型
```

### 三种实验类型

| 特性 | 训练实验 | 评测实验 | Agent评测 |
|------|---------|---------|-----------|
| 类型值 | `training` | `evaluation` | `agent_evaluation` |
| 典型场景 | 模型训练对比 | NL2SQL、NER 评测 | WebAgent、工具调用评测 |
| 核心数据 | 准确率/精确率/召回率/F1/Loss曲线 | 题目→标准答案→模型回答→正确/错误 | 题目→正确率→轨迹→工具调用统计 |
| 详情表格列 | — | 题目、标准答案、模型回答、结果、原因、得分、耗时、Token、标注、Think | 题目、正确答案、Agent回答、结果、原因、Token、耗时、步骤、工具、轨迹、标注 |
| 可展开轨迹 | 否 | 否 | 是 |
| 多维评分 | 自定义指标 | 否 | 是 |

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

### 1. 创建实验类别

首页 → 点击「创建类别」→ 填写名称和描述

### 2. 创建实验

进入一个类别 → 点击「创建实验」→ 选择实验类型

### 3. 训练实验工作流

1. 创建训练实验
2. 创建实验组（如 Full Fine-Tune、LoRA r=8）
3. 点击顶部「管理指标」→ 表格中直接编辑各组数值
4. 可添加自定义指标（如 BLEU、ROUGE）
5. 切换到「训练曲线」标签粘贴 Loss/Accuracy 数据
6. 点击实验组行进入详情，查看训练曲线折线图
7. 勾选两个组 → 对比分析 → 指标叠加对比

### 4. 评测实验工作流

1. 创建评测实验
2. **一键导入 JSON**（推荐）：直接上传含实验组、变量、评测结果的 JSON 文件
3. 或手动创建实验组 → 进入详情 → 「管理评测结果」逐条或 JSON 批量录入
4. 详情页展示题目/标准答案/模型回答的对比表，支持列排序和筛选
5. 可对每条结果添加人工标注（`annotation`）
6. 错误行高亮显示

### 5. Agent 评测工作流

1. 创建 Agent 评测实验
2. **一键导入 JSON**（推荐）：上传含轨迹和多维评分的 JSON 文件
3. 详情页展示：题目、正确答案、Agent 回答、正确性、Token、耗时
4. 点击行末尾 👁 按钮弹出轨迹弹窗，可展开 Think 过程
5. 支持人工标注、列排序、题目和结果筛选

### 6. 对比分析

仪表盘 → 勾选**多个**实验组 → 点击「对比选中组」

- **训练实验**：指标柱状图 + 变量差异表 + Loss/Accuracy 曲线叠加
- **评测实验**：准确率柱状图 + 变量差异表 + 共同用例回答对比（支持题目搜索和正确性筛选）
- **Agent评测**：准确率 + 工具调用对比 + 多维评分柱状图 + 变量差异 + 共同用例回答对比

对比分析支持任意数量的实验组同时对比，每组用不同颜色标识。

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

### Mock 数据文件

项目根目录提供了三个示例 JSON 文件用于测试一键导入：

| 文件 | 实验组数 | 用例数 |
|------|---------|--------|
| `sample_training.json` | 6 | — |
| `sample_evaluation.json` | 6 | 每12条, 共72条 |
| `sample_agent.json` | 5 | 每12条(含轨迹), 共60条 |

## API 接口一览

### 类别
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 列表 |
| POST | `/api/categories` | 创建 |
| PUT | `/api/categories/:id` | 更新 |
| DELETE | `/api/categories/:id` | 删除 |

### 实验
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experiments?categoryId=` | 列表 |
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

删除数据文件后重启即可恢复 seed 数据：

```bash
rm server/data.json
npm run dev
```
