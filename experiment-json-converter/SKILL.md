---
name: experiment-json-converter
description: >
  Convert any experiment data (CSV, Excel, JSON, Markdown, folder of files) into the JSON format
  required by the "实验数据展示平台" (Experiment Data Platform) for one-click import.
  Use this skill whenever the user mentions importing experiments, converting experiment data,
  creating experiment JSON, uploading results, or wants to get their experiment data into the platform.
  Handles training experiments (训练实验) and evaluation experiments (评测实验, including those
  with Agent trajectories). The platform auto-detects Agent experiments by checking if results
  contain a `trajectory` field.
---

# Experiment JSON Converter

**Target model**: qwen3.6 27B (follow explicit rules, avoid open-ended reasoning).
**Read `references/schemas.md` for the exact JSON schemas and field list.**

## Before Starting: Context Interview

Always ask the experiment owner these 3 questions before converting:

1. "这是哪种实验？A)模型训练对比 B)模型评测（问答/NL2SQL/NER等） C)Agent评测（含工具调用轨迹）"
2. "实验数据中有几个实验组？组名分别是什么？"（如果数据中有明确的分组列则跳过）
3. "有没有特殊的评测指标需要保留？"（如BLEU、ROUGE等自定义指标）

This ensures you understand the experimenter's intent before mapping fields.

## Conversion Workflow

### 1. Determine Experiment Type

Use this decision tree — do NOT infer:

```
Columns include accuracy/precision/recall/F1/loss?
  → YES: training
  → NO: evaluation

Results contain a `trajectory` field (array of steps)?
  → include trajectory in each result
  → NOTE: the platform auto-detects this; no separate experiment type needed
```

### 2. Scan All Data Files

Read every file provided. For each file, list:
- File name → which model/group it represents
- Column headers → potential field mapping
- Row count → result count per group

**File naming conventions**: If one file per model, the filename is the `group_name`.

### 3. Build Field Mapping Table

For every column found in the data, assign exactly one role from this table:

| Column Name (常见) | Platform Field | Type | Rule |
|---|---|---|---|
| model, 模型, group, 实验组, model_name | `group_name` | string | Required. If missing, ask user. |
| model (the model identifier itself) | `model` | string | The specific model version |
| question, 题目, 问题, prompt, input, query | `results[].question` | string | **Required for evaluation** |
| answer, 标准答案, expected, gold, ground_truth | `results[].expected_answer` | string | |
| response, 模型回答, output, pred, prediction | `results[].model_response` | string | |
| correct, 是否正确, is_correct, pass, 正确 | `results[].is_correct` | boolean | Convert: 1/0→true/false, "yes"/"no"→true/false, "对"/"错"→true/false |
| score, 得分, 评分 | `results[].score` | number | 0~1 range |
| runtime, 耗时, latency, time, time_ms, cost | `results[].runtime_ms` | integer | milliseconds |
| tokens, token, token_count | `results[].token_count` | integer | |
| reason, 原因, 错误原因, error_reason | `results[].reason` | string | |
| case_id, 用例编号, sample_id, 序号, index, id, no | `results[].case_id` | string | Must preserve from source data |
| trajectory, 轨迹, trace, steps | `results[].trajectory` | array | Array of TrajectoryStep objects |
| temperature, lr, batch_size, epochs, etc | `variables` | key-value | Experiment parameters |

### 4. Handle Sub-categories

If any column has a small number of distinct values (2-10) that classify the test cases:

**Common sub-category columns**: `difficulty`(简单/中等/困难), `task_type`(单表/多表/复杂), `category`, `domain`, `难度`, `任务类型`, `类别`

If found → use nested `results` format:
```json
"results": {
  "单表查询": [{ "question": "...", "is_correct": true }],
  "多表查询": [{ "question": "...", "is_correct": false }]
}
```

Otherwise → use flat `results: [...]` format.

### 5. Handle Trajectory (Agent experiments)

If any result has a `trajectory` field, ensure each step has:

```json
{
  "step": 1,
  "think": "详细的推理链...",    // optional but recommended
  "thought": "得出的结论",        // brief conclusion from thinking
  "action": "执行的动作",
  "observation": "观察到的结果",
  "tool": "使用的工具名",        // optional
  "tool_input": "工具输入",      // optional
  "tool_output": "工具输出"      // optional
}
```

**Important**: `think` is the chain-of-thought (can be long), `thought` is the conclusion (should be short). Both are per-step, not per-result.

### 6. Filter Noise Columns

**MUST remove** these columns from output:
- Random UUIDs (where id column contains random strings like "a1b2c3d4-...")
- File paths (path, file, source)
- Internal tracking codes that are not meaningful for analysis

**MUST keep** these as `case_id`:
- Sequential row numbers (1, 2, 3...) → convert to `case_id`
- Meaningful sample IDs (NL2SQL-001, test_42, etc.) → preserve as `case_id`
- If a column named `case_id`, `用例编号`, `序号`, `sample_id`, `no`, `index` exists with unique values → preserve as `case_id`
- File paths (path, file, source)
- Raw timestamps (unless used as experiment `date`)
- Empty columns or columns where ALL values are the same
- Columns where >50% of values are null/empty

**MUST keep** all other columns as custom fields. They will appear as extra columns in the platform.

### 7. Data Type Conversion

Apply these conversions strictly:

| Original | Convert To | Method |
|----------|-----------|--------|
| "85%" | 0.85 | Remove "%", parse as number, divide by 100 if >1 |
| "yes"/"no" | true/false | String comparison, case-insensitive |
| "对"/"错" | true/false | "对"→true, "错"→false |
| 1/0 (int) | true/false | 1→true, 0→false |
| "1,234" | 1234 | Remove commas, parse |
| "3.2s" | 3200 | Parse number, multiply if unit is seconds |

### 8. Validate Before Output

Checklist before writing JSON:

- [ ] Every group has `group_name` (not empty, not null)
- [ ] Sequential results have `case_id` preserved (if source data had them)
- [ ] Every result has `question` (not empty)
- [ ] `is_correct` is boolean (true/false), not string, not number
- [ ] `score` is number 0~1, not string
- [ ] `runtime_ms` is integer, not string
- [ ] No noise columns present (ID, uuid, path, etc.)
- [ ] Sub-categories correctly nested (if applicable)
- [ ] Trajectory steps numbered correctly (step: 1, 2, 3...)

### 9. Generate Output

Save as JSON file, then report:

```
✅ 转换完成: experiment_import.json
   - 实验类型: 评测实验 (含Agent轨迹) 或 评测实验 或 训练实验
   - 实验组: N 个 (GPT-4o, Claude, Gemini, ...)
   - 子分组: M 个 (单表查询, 多表查询, ...) 或 无
   - 总评测结果: K 条
   - 保留的自定义字段: difficulty, table_count, ...
   - 过滤的噪声列: row_id, uuid, file_path
   
   将此文件在实验平台中使用「一键导入」上传。
```

## Decision Trees (Follow Exactly)

### Is it training or evaluation?
```
Data has accuracy+precision+recall+F1 columns? → training
Data has question+answer+response columns? → evaluation
Otherwise → ask user
```

### Does it use nested results?
```
Data has a column with ≤10 distinct values that categorizes test cases? → YES, use nested
Data has a column named difficulty/category/task_type/难度/任务类型? → YES, use nested
Otherwise → NO, use flat results
```

### Does it need trajectory?
```
Data has trajectory/steps/trace column containing arrays? → YES
Data is from an Agent/ReAct experiment? → YES
Otherwise → NO
```

## Common Pitfalls (Avoid These)

1. **Don't put group-level values into individual results** — if `temperature` is the same for all results in a group, put it in `variables`, not in each `result`
2. **Don't confuse `is_correct` with `score`** — `is_correct` is boolean, `score` is 0~1 float
3. **Don't stringify numbers** — `"0.85"` is wrong, `0.85` is correct
4. **Don't include the group name inside results** — it's already in `group_name`
5. **Don't wrap trajectory in extra objects** — it should be a direct array: `[{step:1,...}]`, not `{steps: [{step:1,...}]}`

## Reference Examples

See `assets/` directory for complete example files:

| File | Type | Key Features |
|------|------|-------------|
| `sample_training.json` | training | 6 groups, custom_metrics, loss/accuracy curves |
| `sample_evaluation.json` | evaluation | 6 groups, flat results |
| `sample_nl2sql.json` | evaluation | 5 groups, nested results with sub-categories, custom fields |
| `sample_agent_v3.json` | evaluation | 6 groups, nested results, trajectory with per-step think |
| `sample_eval_subcat.json` | evaluation | 5 groups, nested results with think |
| `sample_eval_think.json` | evaluation | 5 groups, flat results with per-result think |
