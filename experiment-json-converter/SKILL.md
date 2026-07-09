---
name: experiment-json-converter
description: >
  Convert any experiment data (CSV, Excel, JSON, Markdown, folder of files) into the JSON format
  required by the "实验数据展示平台" (Experiment Data Platform) for one-click import.
  Automatically identifies experiment type, detects sub-categories within results, preserves custom
  variables, and filters irrelevant columns. Use this skill whenever the user mentions importing
  experiments, converting experiment data, creating experiment JSON, uploading results, or wants
  to get their experiment data into the platform. Supports training, evaluation, and agent experiments.
---

# Experiment JSON Converter

Convert experiment data into the platform's one-click import JSON format.
Read `references/schemas.md` for exact field specifications.

## Core Principles

1. **Understand the experiment's purpose before converting** — skim all files to identify what's being measured
2. **Preserve meaningful data** — keep all informative columns as custom fields
3. **Filter noise** — strip IDs, timestamps, internal codes, and obviously irrelevant metadata
4. **Detect natural groupings** — sub-categories in the data should become nested `results`

## Workflow

### Step 1: Understand the Experiment

When given a folder or file set, first survey all files to answer:
- What type of experiment? (training / evaluation / agent)
- What's being compared? (different models? different prompts? different settings?)
- What's the output metric? (accuracy? F1? pass rate?)
- Are there natural sub-groupings? (by difficulty, task type, domain)

**Experiment type detection:**

| Type | Key Indicators in data |
|------|----------------------|
| **training** | accuracy, precision, recall, F1, loss, epoch, lr, batch_size, optimizer |
| **evaluation** | question + answer/response + correct/incorrect, 题目, 标准答案, 模型回答 |
| **agent_evaluation** | trajectory, tool_call, action/observation, multi-step, agent |

### Step 2: Parse All Files

Read every file in the folder. Common formats:
- **CSV** — tabular results (most common)
- **Excel** (`.xlsx`, `.xls`) — often contains multiple sheets
- **JSON/JSONL** — structured data, trajectories
- **TXT/MD** — logs, descriptions

For each file, identify:
- Column headers and their meanings
- Which column identifies the group (model name, experiment name)
- Which columns are results vs metadata

### Step 3: Classify Columns

For each column in the data, decide its role:

| Role | Examples | Action |
|------|----------|--------|
| **Group identifier** | model, model_name, 实验组, group | Use as `group_name` |
| **Sub-category marker** | difficulty, task_type, category, domain, 难度, 任务类型 | Detect and use for nested `results` |
| **Standard field** | question, answer, response, correct, score, runtime | Map to platform field names |
| **Informative variable** | table_count, prompt_version, temperature | Preserve in `results[]` as custom field |
| **Noise** | row_id, timestamp, internal_id, uuid, path | Drop — not meaningful for analysis |

**Sub-category detection**: If a column has a small set of distinct values (2-10 unique values) that categorize the test cases, it should be used to create nested results:
```json
"results": {
  "单表查询": [...],
  "多表查询": [...]
}
```
If no such column exists, use the flat `results: [...]` format.

### Step 4: Map Fields

Map columns to platform field names. See `references/schemas.md` for the complete field list.

**Important**: columns that don't map to any standard field AND are not group/sub-category identifiers should be preserved in each result as custom fields. The platform will automatically display them as additional columns.

### Step 5: Validate and Report

Before generating output, check:
- Each group has a `group_name`
- Evaluation/Agent results each have at least `question`
- Numeric fields are actual numbers (not strings like "85%")
- Boolean fields are `true`/`false` (not "yes"/"no" or 1/0)

Report any issues found:
- "缺少以下必要字段：... 请补充"
- "以下列被识别为无关变量已过滤：..."
- "检测到子分组：单表查询(12条), 多表查询(8条), 复杂查询(6条)"

### Step 6: Generate JSON

Output a single JSON file with all groups.

**Output:**
1. Save as `experiment_import.json`
2. Show a summary: N groups, M sub-categories (if any), K total results
3. List preserved custom fields
4. Tell user: "将此文件在实验平台中使用「一键导入」上传即可"

## JSON Formats

### Flat results (no sub-categories)
```json
[{
  "group_name": "GPT-4o",
  "model": "gpt-4o",
  "eval_dataset": "MyEval",
  "variables": { "temperature": 0.7 },
  "results": [
    { "question": "...", "expected_answer": "...", "model_response": "...", "is_correct": true, "difficulty": "easy" }
  ]
}]
```

Any fields in `results[]` beyond the standard ones (`question`, `expected_answer`, `model_response`, `is_correct`, `score`, `runtime_ms`, `token_count`, `reason`) become custom columns in the platform.

### Nested results (with sub-categories)
```json
[{
  "group_name": "GPT-4o",
  "model": "gpt-4o",
  "eval_dataset": "NL2SQL-Bench",
  "variables": { "temperature": 0.3 },
  "results": {
    "单表查询": [
      { "question": "...", "is_correct": true }
    ],
    "多表查询": [
      { "question": "...", "is_correct": false }
    ]
  }
}]
```

### Training experiment
```json
[{
  "group_name": "ResNet-50",
  "model": "resnet50",
  "variables": { "lr": 0.1, "batch_size": 256 },
  "metrics": {
    "accuracy": 0.761,
    "precision": 0.758,
    "recall": 0.764,
    "f1_score": 0.761,
    "loss_curve": [2.8, 2.3, 1.9],
    "accuracy_curve": [0.15, 0.32, 0.45],
    "custom_metrics": { "top5_accuracy": 0.95 }
  }
}]
```

## Noise Filtering Rules

The following should NOT be included in the output:
- Row numbers, auto-increment IDs, UUIDs
- File paths, source filenames
- Raw timestamps (unless they are the `date` field)
- Internal tracking codes
- Columns with all-null or all-same values
- Columns with >50% missing values

## Examples

**Example: Folder with 3 CSV files**
```
experiment/
  gpt4o_results.csv    → columns: id, question, answer, model_response, correct, difficulty, time_ms
  claude_results.csv   → columns: id, question, answer, model_response, correct, difficulty, time_ms
  config.txt           → "temperature=0.7, max_tokens=4096"
```
→ Output: 2 groups (from filenames), `difficulty` preserved as custom field, `id` filtered, `time_ms` → `runtime_ms`, `config.txt` values → `variables`

**Example: CSV with sub-category column**
```
model, question, sql_type, answer, response, correct
GPT-4o, "查询所有用户", "单表", "SELECT *", "SELECT *", true
GPT-4o, "JOIN查询", "多表", "SELECT ... JOIN", "SELECT ... JOIN", false
```
→ Detected `sql_type` has 2 unique values → nested results format
