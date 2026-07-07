---
name: experiment-json-converter
description: >
  Convert user experiment data files (CSV, Excel, JSON, Markdown tables, or plain text descriptions)
  into the JSON format required by the "实验数据展示平台" (Experiment Data Platform) for one-click import.
  Use this skill whenever the user mentions importing experiments, converting experiment data, creating
  experiment JSON, uploading results, or talks about their experiment results and wants to get them
  into the platform. Supports all three experiment types: training (训练实验), evaluation (评测实验),
  and agent evaluation (Agent评测).
---

# Experiment JSON Converter

Convert any experiment data into the platform's one-click import JSON format.
Read the reference files in `references/` for the exact JSON schemas and field details.

## Workflow

### Step 1: Identify Experiment Type

Ask the user or infer from context which experiment type they need:

| Type | Key Indicators |
|------|---------------|
| **training** | Keywords: 训练, 模型训练, 准确率, accuracy, precision, recall, F1, loss, epoch, learning rate, 超参 |
| **evaluation** | Keywords: 评测, 测评, NL2SQL, NER, 问答, 翻译, 正确率, 题目, 标准答案, 模型回答 |
| **agent_evaluation** | Keywords: Agent, 工具调用, 轨迹, trajectory, tool, 多步推理, ReAct, 网页导航 |

If unclear, ask: "这是哪种类型的实验？训练实验 / 评测实验 / Agent评测？"

### Step 2: Parse User's Data

Accept data in any of these formats:
- **CSV** (`.csv`) — most common for tabular results
- **Excel** (`.xlsx`, `.xls`)
- **JSON** (`.json`) — already structured
- **Markdown table** — pasted inline
- **Free text** — describe the experiment and I'll structure it

Read the file(s) and understand the column mapping.

### Step 3: Map Columns to Schema

Map the user's column names to the platform's field names. Common mappings:

| User's Column (may vary) | Platform Field | Required For |
|--------------------------|----------------|--------------|
| 实验组, 模型名, group, model_name | `group_name` | ALL |
| 模型, model | `model` | ALL |
| 准确率, accuracy, acc | `metrics.accuracy` | training |
| 精确率, precision | `metrics.precision` | training |
| 召回率, recall | `metrics.recall` | training |
| F1, f1_score | `metrics.f1_score` | training |
| 题目, 问题, question, prompt | `results[].question` | evaluation |
| 标准答案, expected, answer, gold | `results[].expected_answer` | evaluation |
| 模型回答, response, output, pred | `results[].model_response` | evaluation |
| 是否正确, is_correct, correct | `results[].is_correct` | evaluation |
| 得分, score | `results[].score` | evaluation |
| 耗时, runtime, latency | `results[].runtime_ms` | evaluation |
| Token, tokens | `results[].token_count` | evaluation |
| 原因, reason | `results[].reason` | evaluation |
| 轨迹, trajectory | `results[].trajectory` | agent |
| 多维评分, custom_scores | `results[].custom_scores` | agent |
| 负责人, owner | `owner` (experiment level) | ALL |

**Other columns** not in the table above → treat as `variables` on each group or `custom_metrics` for training.

### Step 4: Validate Required Fields

Check for missing required data and report to the user:

**Training** requires per group: `group_name`, at least one of `metrics.{accuracy, precision, recall, f1_score}`

**Evaluation** requires per result: `question`. Also recommend: `expected_answer`, `model_response`, `is_correct`

**Agent** requires: same as evaluation + recommend `trajectory` for meaningful display

If data is missing, say: "缺少以下必要字段：[list]. 请补充这些数据，或告诉我它们在哪里。"

### Step 5: Handle Group Detection

- If data has a column that clearly identifies groups (group, model_name, 实验组), use it
- If all rows belong to one group, ask the user for the group name
- If unclear, ask: "这些数据包含几个实验组？每个组的名称是什么？"

### Step 6: Generate and Output the JSON

Generate the JSON array according to the schema in `references/schemas.md`.

**Output format:**
1. Save the JSON to a file (suggest a name like `experiment_import.json`)
2. Display a preview of the structure
3. Tell the user: "将此文件在实验平台中使用「一键导入」上传即可"

## JSON Structure Overview

### Training Experiment
```json
[{
  "group_name": "string (required)",
  "model": "string",
  "variables": { "key": "value" },
  "metrics": {
    "accuracy": 0.0,
    "precision": 0.0,
    "recall": 0.0,
    "f1_score": 0.0,
    "token_count": 0,
    "runtime": 0,
    "loss_curve": [],
    "accuracy_curve": [],
    "custom_metrics": {}
  }
}]
```

### Evaluation Experiment
```json
[{
  "group_name": "string (required)",
  "model": "string",
  "eval_dataset": "string",
  "variables": { "key": "value" },
  "results": [{
    "question": "string (required)",
    "expected_answer": "string",
    "model_response": "string",
    "is_correct": true,
    "score": 1.0,
    "runtime_ms": 0,
    "token_count": 0,
    "reason": "string",
    "annotation": "string",
    "think": "string"
  }]
}]
```

### Agent Evaluation Experiment
Same as evaluation, plus in each result:
```json
{
  "trajectory": [{ "step": 1, "thought": "...", "action": "...", "observation": "..." }],
  "custom_scores": { "tool_accuracy": 0.9, "reasoning": 0.8 }
}
```

## Common Scenarios

### Scenario A: CSV of model comparison results
User has `results.csv` with columns: model, question, answer, correct
→ Parse rows, group by `model`, generate evaluation JSON

### Scenario B: Multiple CSV files per model
User has `gpt4o.csv`, `claude.csv` each with question/answer/score
→ Each file = one group, filename = group_name

### Scenario C: Training metrics table
User pastes a table: Model | Accuracy | F1 | Precision | Recall | Epochs
→ Each row = one group, metrics from columns, epochs → variables

### Scenario D: Agent trajectory logs
User has JSONL files with agent execution traces
→ Parse each trace into trajectory array, extract question from first step
