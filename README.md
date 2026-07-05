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
│   │   └── CsvUploader.tsx       # CSV 拖拽上传组件
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
| 详情表格列 | — | 题目、标准答案、模型回答、结果、得分、标签 | 题目、结果、Token、耗时、步骤、工具调用、展开 |
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

  // Agent 评测专用 (可选)
  trajectory?: TrajectoryStep[];
  custom_scores?: Record<string, number>;
  conversations?: { role: string; content: string }[];

  // JOIN 字段 (后端自动填充)
  question?: string;
  expected_answer?: string;
  category_tag?: string;
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
2. 点击「管理测试用例」→ 逐条添加或 CSV 上传题目+标准答案
3. 创建实验组
4. 点击实验组行进入详情
5. 点击「管理评测结果」→ 逐条录入或 CSV 批量导入
6. 详情页展示题目/标准答案/模型回答的对比表
7. 错误行高亮显示

### 5. Agent 评测工作流

1. 创建 Agent 评测实验
2. 添加测试用例
3. 创建实验组
4. 进入详情 → 「管理评测结果」→ 录入结果时需填写：
   - 模型回答
   - **轨迹 JSON**：`[{"step":1,"thought":"...","action":"...","observation":"..."}]`
   - **多维评分**：`tool_accuracy:0.9, reasoning:0.8`
5. 详情页展示：题目、正确性、Token、耗时、步骤数、工具调用次数
6. 点击「展开」查看每步轨迹时间线

### 6. 对比分析

仪表盘 → 勾选两个实验组 → 点击「对比选中组」

- 训练实验：指标柱状图 + 参数差异表 + Loss/Accuracy 曲线叠加
- 评测实验：准确率对比 + 参数差异 + 共同用例回答对比
- Agent 评测：准确率对比 + 多维评分对比柱状图 + 参数差异

## CSV 批量导入格式

### 测试用例 CSV

用于批量导入评测实验的题目和标准答案。

**表头**：

| 列名 | 必填 | 说明 | 示例 |
|------|:--:|------|------|
| question | ✅ | 题目/问题文本 | `法国首都是哪里？` |
| expected_answer | ✅ | 标准答案 | `巴黎` |
| category_tag | | 分类标签（可选） | `知识问答` |

**示例**：
```csv
question,expected_answer,category_tag
法国首都是哪里？,巴黎,知识问答
计算 123 * 456,56088,数学计算
将 Hello 翻译成中文,你好,翻译
```

---

### 评测结果 CSV（评测实验）

用于批量导入 evaluation 类型的评测结果。

**表头**：

| 列名 | 必填 | 说明 | 示例 |
|------|:--:|------|------|
| question | ✅ | 题目（用于匹配已有测试用例） | `法国首都是哪里？` |
| expected_answer | ✅ | 标准答案（用于匹配） | `巴黎` |
| model_response | ✅ | 模型回答 | `巴黎是法国的首都。` |
| is_correct | | 是否正确：1=是, 0=否 | `1` |
| score | | 得分 (0~1)，默认等于 is_correct | `1.0` |
| runtime_ms | | 执行耗时(毫秒) | `190` |
| token_count | | Token 消耗 | `25` |

**示例**：
```csv
question,expected_answer,model_response,is_correct,score,runtime_ms,token_count
法国首都是哪里？,巴黎,巴黎是法国的首都。,1,1.0,190,25
计算 123 * 456,56088,56088,1,1.0,160,20
将 Hello 翻译成中文,你好,哈喽,0,0.0,230,32
```

---

### 评测结果 CSV（Agent 评测）

用于批量导入 agent_evaluation 类型的评测结果，额外包含轨迹和多维评分。

**表头**（在上表基础上增加）：

| 列名 | 必填 | 说明 | 示例 |
|------|:--:|------|------|
| trajectory | | 执行轨迹 JSON 数组 | 见下方示例 |
| custom_scores | | 多维评分 JSON 对象 | `{"tool_accuracy":0.9}` |

**示例**：
```csv
question,expected_answer,model_response,is_correct,score,runtime_ms,token_count,trajectory,custom_scores
搜索北京天气,返回气温和湿度,搜索成功 22°C 45%,1,1.0,2500,350,"[{""step"":1,""thought"":""打开天气网站"",""action"":""navigate"",""observation"":""页面加载成功""},{""step"":2,""thought"":""搜索北京"",""action"":""type"",""observation"":""输入完成""},{""step"":3,""thought"":""提取结果"",""action"":""extract"",""observation"":""22°C, 45%""}]","{""search_accuracy"":1.0,""extraction_quality"":1.0,""efficiency"":0.9}"
```

---

### CSV 注意事项

1. **编码**：必须使用 UTF-8 编码
2. **匹配规则**：系统用 `question` + `expected_answer` 匹配已有测试用例；匹配不到则**自动创建**新测试用例
3. **JSON 字段**：`trajectory` 和 `custom_scores` 必须是合法 JSON。CSV 中 JSON 内的双引号需转义为两个双引号 `""`
4. **逗号处理**：如果字段内容包含逗号，需用双引号包裹该字段
5. **推荐工具**：Excel、VS Code（保存时选 UTF-8）

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
| POST | `/api/experiments/:expId/test-cases/upload` | CSV 批量上传 |
| PUT | `/api/test-cases/:id` | 更新 |
| DELETE | `/api/test-cases/:id` | 删除（级联删除关联评测结果） |

### 评测结果
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/groups/:groupId/results` | 列表(含汇总统计) |
| POST | `/api/groups/:groupId/results` | 逐条创建 |
| POST | `/api/groups/:groupId/results/upload` | CSV 批量上传 |
| PUT | `/api/results/:id` | 更新 |
| DELETE | `/api/results/:id` | 删除 |

## 数据重置

删除数据文件后重启即可恢复 seed 数据：

```bash
rm server/data.json
npm run dev
```
