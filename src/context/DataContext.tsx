import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useState } from 'react';
import type { Category, Experiment, ExperimentGroup, NavigationState, NavigationAction } from '../types';
import { fetchCategories, fetchExperimentDetail } from '../api/endpoints';

// ========== 初始导航状态 ==========
const initialNav: NavigationState = {
  selectedCategoryId: null,
  selectedExperimentId: null,
  selectedGroupId: null,
  compareLeftId: null,
  compareRightId: null,
};

// ========== Reducer ==========
function navReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'SELECT_CATEGORY':
      return { ...state, selectedCategoryId: action.categoryId, selectedExperimentId: null, selectedGroupId: null, compareLeftId: null, compareRightId: null };
    case 'SELECT_EXPERIMENT':
      return { ...state, selectedExperimentId: action.experimentId, selectedGroupId: null, compareLeftId: null, compareRightId: null };
    case 'SELECT_GROUP':
      return { ...state, selectedGroupId: action.groupId };
    case 'SET_COMPARE_GROUPS':
      return { ...state, compareLeftId: action.leftId, compareRightId: action.rightId };
    case 'GO_HOME':
      return { ...initialNav };
    default:
      return state;
  }
}

// ========== Context ==========
interface DataContextValue {
  categories: Category[];
  loading: boolean;
  refreshCategories: () => Promise<void>;
  experimentDetail: Experiment | null;
  experimentLoading: boolean;
  refreshExperiment: () => Promise<void>;
  nav: NavigationState;
  dispatch: React.Dispatch<NavigationAction>;
  selectedCategory: Category | null;
  selectedExperiment: Experiment | null;
  selectedGroup: ExperimentGroup | null;
  compareLeft: ExperimentGroup | null;
  compareRight: ExperimentGroup | null;
  goHome: () => void;
  selectCategory: (id: string) => void;
  selectExperiment: (id: string) => void;
  selectGroup: (id: string) => void;
  setCompareGroups: (leftId: string, rightId: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [nav, dispatch] = useReducer(navReducer, initialNav);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [experimentDetail, setExperimentDetail] = useState<Experiment | null>(null);
  const [experimentLoading, setExperimentLoading] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try { setCategories(await fetchCategories()); }
    catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const loadExperiment = useCallback(async () => {
    if (!nav.selectedExperimentId) { setExperimentDetail(null); return; }
    setExperimentLoading(true);
    try { setExperimentDetail(await fetchExperimentDetail(nav.selectedExperimentId)); }
    catch { /* */ }
    finally { setExperimentLoading(false); }
  }, [nav.selectedExperimentId]);

  useEffect(() => { loadExperiment(); }, [loadExperiment]);

  // 派生：优先用显式选中的 category，否则从 experiment 反查（支持直接 URL 跳转）
  const selectedCategory = useMemo(() => {
    if (nav.selectedCategoryId) return categories.find((c) => c.id === nav.selectedCategoryId) ?? null;
    if (experimentDetail?.category_id) return categories.find((c) => c.id === experimentDetail.category_id) ?? null;
    return null;
  }, [categories, nav.selectedCategoryId, experimentDetail]);

  const selectedExperiment = experimentDetail;

  const selectedGroup = useMemo(() => {
    if (!experimentDetail?.groups) return null;
    return experimentDetail.groups.find((g) => g.id === nav.selectedGroupId) ?? null;
  }, [experimentDetail, nav.selectedGroupId]);

  const compareLeft = useMemo(() => {
    if (!experimentDetail?.groups) return null;
    return experimentDetail.groups.find((g) => g.id === nav.compareLeftId) ?? null;
  }, [experimentDetail, nav.compareLeftId]);

  const compareRight = useMemo(() => {
    if (!experimentDetail?.groups) return null;
    return experimentDetail.groups.find((g) => g.id === nav.compareRightId) ?? null;
  }, [experimentDetail, nav.compareRightId]);

  const goHome = useCallback(() => dispatch({ type: 'GO_HOME' }), []);
  const selectCategory = useCallback((id: string) => dispatch({ type: 'SELECT_CATEGORY', categoryId: id }), []);
  const selectExperiment = useCallback((id: string) => dispatch({ type: 'SELECT_EXPERIMENT', experimentId: id }), []);
  const selectGroup = useCallback((id: string) => dispatch({ type: 'SELECT_GROUP', groupId: id }), []);
  const setCompareGroups = useCallback((leftId: string, rightId: string) => dispatch({ type: 'SET_COMPARE_GROUPS', leftId, rightId }), []);

  const value: DataContextValue = {
    categories, loading, refreshCategories: loadCategories,
    experimentDetail, experimentLoading, refreshExperiment: loadExperiment,
    nav, dispatch,
    selectedCategory, selectedExperiment, selectedGroup, compareLeft, compareRight,
    goHome, selectCategory, selectExperiment, selectGroup, setCompareGroups,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
