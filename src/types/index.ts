// ========== 实验数据平台 v2 - 类型定义 ==========

/** 实验类型 */
export type ExperimentType = 'training' | 'evaluation' | 'agent_evaluation' | 'other';

/** 实验变量（键值对） */
export interface ExperimentParameters {
  [key: string]: number | string;
}

// ====== 训练指标 ======
export interface TrainingMetrics {
  id: string;
  groupId: string;
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

// ====== 测试用例 ======
export interface TestCase {
  id: string;
  experimentId: string;
  question: string;
  expected_answer: string;
  category_tag: string;
}

// ====== Agent 轨迹步骤 ======
export interface TrajectoryStep {
  step: number;
  thought?: string;
  action?: string;
  observation?: string;
  tool?: string;
  tool_input?: string;
  tool_output?: string;
}

// ====== 评测结果 ======
export interface EvaluationResult {
  id: string;
  groupId: string;
  test_case_id: string;
  model_response: string;
  is_correct: number; // 0 或 1
  score: number;
  runtime_ms: number;
  token_count: number;
  reason?: string;                         // 正确性判断原因
  annotation?: string;                     // 人工标注
  think?: string;                          // 模型思考过程
  ai_scores?: Record<string, number>;      // AI自动标注多维度评分
  // 新增 Agent 评测字段
  trajectory?: TrajectoryStep[];           // Agent 执行轨迹
  custom_scores?: Record<string, number>;  // 多维自定义评分
  conversations?: { role: string; content: string }[]; // 多轮对话
  // JOIN 字段
  question?: string;
  expected_answer?: string;
  category_tag?: string;
}

// ====== 评测结果汇总 ======
export interface EvaluationSummary {
  results: EvaluationResult[];
  total: number;
  correctCount: number;
  accuracy: number;
  avgRuntime: number;
  totalTokens: number;
}

// ====== 实验组 ======
export interface ExperimentGroup {
  id: string;
  experiment_id: string;       // 后端字段名
  experimentId?: string;        // 前端兼容
  name: string;
  model: string;
  eval_dataset?: string;           // 评测集名称
  parameters: ExperimentParameters;
  // 训练指标（仅 training 型）
  metrics?: TrainingMetrics | null;
  // 评测结果（仅 evaluation 型）
  results?: EvaluationResult[];
  resultCount?: number;
  correctCount?: number;
  accuracy?: number;
  error_clusters?: { name: string; description: string; count: number; caseIndices: number[] }[];
  ai_report?: string;
}

// ====== 实验 ======
export interface Experiment {
  id: string;
  categoryId?: string;
  category_id: string;
  name: string;
  description: string;
  type: ExperimentType;
  date: string;
  owner?: string;              // 实验负责人
  groupCount?: number;
  groups?: ExperimentGroup[];
  testCases?: TestCase[];
}

// ====== 实验类别 ======
export interface Category {
  id: string;
  name: string;
  description: string;
  experimentCount?: number;
  experiments?: Experiment[];   // 前端嵌套使用
  created_at?: string;
}

// ====== 导航 ======
export interface NavigationState {
  selectedCategoryId: string | null;
  selectedExperimentId: string | null;
  selectedGroupId: string | null;
  compareGroupIds: string[];
}

export type NavigationAction =
  | { type: 'SELECT_CATEGORY'; categoryId: string }
  | { type: 'SELECT_EXPERIMENT'; experimentId: string }
  | { type: 'SELECT_GROUP'; groupId: string }
  | { type: 'SET_COMPARE_GROUPS'; groupIds: string[] }
  | { type: 'GO_HOME' };
