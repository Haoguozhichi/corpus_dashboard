import { get, post, put, del, uploadFile } from './client';
import type { Category, Experiment, ExperimentGroup, TrainingMetrics, TestCase, EvaluationSummary, EvaluationResult } from '../types';

// ====== 类别 ======
export const fetchCategories = () => get<Category[]>('/categories');
export const createCategory = (data: { name: string; description?: string }) => post<Category>('/categories', data);
export const updateCategory = (id: string, data: { name?: string; description?: string }) => put<Category>(`/categories/${id}`, data);
export const deleteCategory = (id: string) => del<{ success: boolean }>(`/categories/${id}`);

// ====== 实验 ======
export const fetchExperiments = (categoryId?: string) => {
  const query = categoryId ? `?categoryId=${categoryId}` : '';
  return get<Experiment[]>(`/experiments${query}`);
};
export const fetchExperimentDetail = (id: string) => get<Experiment>(`/experiments/${id}`);
export const createExperiment = (data: { categoryId: string; name: string; description?: string; type: string; date: string }) =>
  post<Experiment>('/experiments', data);
export const updateExperiment = (id: string, data: { name?: string; description?: string; type?: string; date?: string }) =>
  put<Experiment>(`/experiments/${id}`, data);
export const deleteExperiment = (id: string) => del<{ success: boolean }>(`/experiments/${id}`);

// ====== 实验组 ======
export const fetchGroups = (experimentId: string) => get<ExperimentGroup[]>(`/experiments/${experimentId}/groups`);
export const createGroup = (experimentId: string, data: { name: string; model?: string; parameters?: Record<string, unknown> }) =>
  post<ExperimentGroup>(`/experiments/${experimentId}/groups`, data);
export const updateGroup = (id: string, data: { name?: string; model?: string; parameters?: Record<string, unknown> }) =>
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
export const uploadTestCasesCsv = (experimentId: string, file: File) =>
  uploadFile<{ imported: number }>(`/experiments/${experimentId}/test-cases/upload`, file);
export const updateTestCase = (id: string, data: { question?: string; expected_answer?: string; category_tag?: string }) =>
  put<TestCase>(`/test-cases/${id}`, data);
export const deleteTestCase = (id: string) => del<{ success: boolean }>(`/test-cases/${id}`);

// ====== 评测结果 ======
export const fetchResults = (groupId: string) => get<EvaluationSummary>(`/groups/${groupId}/results`);
export const createResult = (groupId: string, data: { test_case_id?: string; question?: string; expected_answer?: string; model_response?: string; is_correct?: boolean; score?: number; runtime_ms?: number; token_count?: number; trajectory?: unknown; custom_scores?: Record<string, number> }) =>
  post<EvaluationResult>(`/groups/${groupId}/results`, data);
export const uploadResultsCsv = (groupId: string, file: File) =>
  uploadFile<{ imported: number }>(`/groups/${groupId}/results/upload`, file);
export const updateResult = (id: string, data: { model_response?: string; is_correct?: boolean; score?: number; runtime_ms?: number; token_count?: number }) =>
  put<EvaluationResult>(`/results/${id}`, data);
export const deleteResult = (id: string) => del<{ success: boolean }>(`/results/${id}`);
