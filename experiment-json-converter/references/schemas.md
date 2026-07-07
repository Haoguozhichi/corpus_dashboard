# Experiment JSON Schema Reference

Complete field specifications for the experiment data platform's one-click import JSON format.

## Training Experiment Schema

Each element in the array represents one experiment group.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `group_name` | string | ✅ | — | Experiment group name (e.g., "ResNet-50") |
| `model` | string | | `""` | Model identifier (e.g., "resnet50-torchvision") |
| `eval_dataset` | string | | `""` | Evaluation dataset name |
| `variables` | object | | `{}` | Experiment variables as key-value pairs (e.g., `{"lr": 0.1, "batch_size": 256}`) |
| `metrics` | object | | `{}` | Training metrics |

### `metrics` object fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `accuracy` | number (0-1) | `0` | Accuracy |
| `precision` | number (0-1) | `0` | Precision |
| `recall` | number (0-1) | `0` | Recall |
| `f1_score` | number (0-1) | `0` | F1 Score |
| `token_count` | integer | `0` | Total tokens consumed |
| `runtime` | integer | `0` | Runtime in seconds |
| `loss_curve` | number[] | `[]` | Loss curve data points (e.g., `[2.8, 2.3, 1.9, ...]`) |
| `accuracy_curve` | number[] | `[]` | Accuracy curve data points (e.g., `[0.15, 0.32, 0.45, ...]`) |
| `custom_metrics` | object | `{}` | Custom metrics (e.g., `{"top5_accuracy": 0.95}`) |

## Evaluation Experiment Schema

Same top-level fields as training, plus a `results` array.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `group_name` | string | ✅ | — | Experiment group name |
| `model` | string | | `""` | Model identifier |
| `eval_dataset` | string | | `""` | Evaluation dataset name |
| `variables` | object | | `{}` | Experiment variables |
| `results` | array | | `[]` | Evaluation results |

### `results[]` item fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `question` | string | ✅ | — | The question/prompt |
| `expected_answer` | string | | `""` | The expected/gold answer |
| `model_response` | string | | `""` | The model's actual response |
| `is_correct` | boolean | | `false` | Whether the answer is correct |
| `score` | number (0-1) | | `is_correct ? 1 : 0` | Numeric score |
| `runtime_ms` | integer | | `0` | Execution time in milliseconds |
| `token_count` | integer | | `0` | Token consumption |
| `reason` | string | | — | Reason for correctness judgment |
| `annotation` | string | | — | Manual annotation/notes |
| `think` | string | | — | Model's thinking process |

## Agent Evaluation Experiment Schema

Same as Evaluation experiment, with additional fields in each result.

### Additional `results[]` fields for Agent:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `trajectory` | array | | — | Agent execution trajectory |
| `custom_scores` | object | | — | Multi-dimensional custom scores |

### `trajectory[]` item (TrajectoryStep):

| Field | Type | Description |
|-------|------|-------------|
| `step` | integer | Step number |
| `thought` | string | Agent's reasoning/thinking |
| `action` | string | Action taken |
| `observation` | string | Result observed |
| `tool` | string | Tool name used |
| `tool_input` | string | Input to the tool |
| `tool_output` | string | Output from the tool |

### `custom_scores` example:
```json
{
  "tool_accuracy": 0.9,
  "reasoning": 0.8,
  "efficiency": 0.7,
  "error_recovery": 0.6
}
```

## Important Notes

1. **Same `group_name` rows are merged** into one group in the platform
2. **Same `question` + `expected_answer` pairs** are matched to the same test case
3. **Unknown columns** in CSV are treated as `variables` on the group
4. **All numeric values** use JavaScript number type (not strings)
5. **Boolean fields** use `true`/`false` (not `1`/`0` or `"yes"`/`"no"`)
6. **Curve data** uses comma-separated number arrays, not string representations
