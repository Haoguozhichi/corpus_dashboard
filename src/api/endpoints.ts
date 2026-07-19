import { get, post, put, del, uploadFile } from './client';
import type { Experiment, ExperimentGroup, TrainingMetrics, TestCase, EvaluationSummary, EvaluationResult } from '../types';

// ====== 实验 ======
export const fetchExperiments = (search?: string) => {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return get<Experiment[]>(`/experiments${query}`);
};
export const fetchExperimentDetail = (id: string) => get<Experiment>(`/experiments/${id}`);
export const createExperiment = (data: { name: string; description?: string; date: string; owner?: string }) =>
  post<Experiment>('/experiments', data);
export const updateExperiment = (id: string, data: { name?: string; description?: string; date?: string; owner?: string; ai_report?: string; conclusion?: string }) =>
  put<Experiment>(`/experiments/${id}`, data);
export const deleteExperiment = (id: string) => del<{ success: boolean }>(`/experiments/${id}`);
export const importExperimentJson = (experimentId: string, file: File) =>
  uploadFile<{ groupsCreated: number; resultsCreated: number; testCasesCreated: number }>(`/experiments/${experimentId}/import`, file);

// ====== 实验组 ======
export const fetchGroups = (experimentId: string) => get<ExperimentGroup[]>(`/experiments/${experimentId}/groups`);
export const createGroup = (experimentId: string, data: { name: string; model?: string; eval_dataset?: string; parameters?: Record<string, unknown> }) =>
  post<ExperimentGroup>(`/experiments/${experimentId}/groups`, data);
export const updateGroup = (id: string, data: { name?: string; model?: string; eval_dataset?: string; parameters?: Record<string, unknown> }) =>
  put<ExperimentGroup>(`/groups/${id}`, data);
export const deleteGroup = (id: string) => del<{ success: boolean }>(`/groups/${id}`);

// ====== 训练指标 ======
export const fetchMetrics = (groupId: string) => get<TrainingMetrics | null>(`/groups/${groupId}/metrics`);
export const saveMetrics = (groupId: string, data: Partial<TrainingMetrics>) =>
  put<TrainingMetrics>(`/groups/${groupId}/metrics`, data);

// ====== 测试用例 ======
export const fetchTestCases = (experimentId: string) => get<TestCase[]>(`/experiments/${experimentId}/test-cases`);
export const createTestCase = (experimentId: string, data: { question: string; expected_answer?: string; category_tag?: string }) =>
  post<TestCase>(`/experiments/${experimentId}/test-cases`, data);
export const uploadTestCasesJson = (experimentId: string, file: File) =>
  uploadFile<{ imported: number }>(`/experiments/${experimentId}/test-cases/upload`, file);
export const updateTestCase = (id: string, data: { question?: string; expected_answer?: string; category_tag?: string }) =>
  put<TestCase>(`/test-cases/${id}`, data);
export const deleteTestCase = (id: string) => del<{ success: boolean }>(`/test-cases/${id}`);

// ====== 评测结果 ======
export const fetchResults = (groupId: string) => get<EvaluationSummary>(`/groups/${groupId}/results`);
export const batchResults = (groupId: string, data: { deletes?: string[]; updates?: Record<string, unknown>[]; creates?: Record<string, unknown>[] }) =>
  post<{ deleted: number; updated: number; created: number }>(`/groups/${groupId}/results/batch`, data);
export const createResult = (groupId: string, data: { test_case_id?: string; question?: string; expected_answer?: string; model_response?: string; is_correct?: boolean; score?: number; runtime_ms?: number; token_count?: number; reason?: string; trajectory?: unknown; custom_scores?: Record<string, number> }) =>
  post<EvaluationResult>(`/groups/${groupId}/results`, data);
export const uploadResultsJson = (groupId: string, file: File) =>
  uploadFile<{ imported: number }>(`/groups/${groupId}/results/upload`, file);
export const updateResult = (id: string, data: { model_response?: string; is_correct?: boolean; score?: number; runtime_ms?: number; token_count?: number; reason?: string; annotation?: string; think?: string; trajectory?: unknown; custom_scores?: Record<string, number> }) =>
  put<EvaluationResult>(`/results/${id}`, data);
export const deleteResult = (id: string) => del<{ success: boolean }>(`/results/${id}`);

// ====== LLM ======
export const getLlmConfig = () => get<{ apiUrl: string; modelName: string; apiKey: string; prompts?: { diagnoseError?: string; clusterErrors?: string } }>('/llm/config');
export const getLlmPrompts = () => get<{ diagnoseError?: string; clusterErrors?: string }>('/llm/prompts');
export const saveLlmPrompts = (data: { diagnoseError?: string; clusterErrors?: string }) => put('/llm/prompts', data);
export const saveLlmConfig = (data: { apiUrl: string; modelName: string; apiKey: string }) => put('/llm/config', data);
export const testLlmConnection = (data: { apiUrl: string; modelName: string; apiKey: string }) => post<{ success: boolean; message?: string; error?: string }>('/llm/test-connection', data);
export const diagnoseError = (data: { question: string; expected_answer: string; model_response: string }) => post<{ result: string }>('/llm/diagnose-error', data);
export const autoAnnotate = (data: { question: string; expected_answer: string; model_response: string }) => post<Record<string, number>>('/llm/auto-annotate', data);
export const clusterErrors = (data: { cases: { question: string; model_response: string }[] }) => post<{ clusters?: { name: string; description: string; count: number; caseIndices: number[] }[]; summary?: string; error?: string; raw?: string }>('/llm/cluster-errors', data);
export const llmCompareAnalysis = (data: { question: string; expected_answer: string; responseA: string; correctA: boolean; responseB: string; correctB: boolean; nameA: string; nameB: string }) => post<{ result: string }>('/llm/compare-analysis', data);
export const diagnoseTrajectory = (data: { question: string; trajectory: unknown; is_correct: boolean }) => post<{ result: string }>('/llm/diagnose-trajectory', data);
export const generateReport = (data: { experiment: unknown }) => post<{ result: string }>('/llm/generate-report', data);
