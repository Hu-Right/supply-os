/**
 * 公采公告搜索 Hook — 编排入口
 * Notice Search Hook — Orchestration Entry
 *
 * @module features/procurement/hooks/useNoticeSearch
 * @description 采购公告列表的搜索栏 + URL 参数事实源 + 分页 + 多维过滤状态，
 *              以及 fetchUnifiedSearch 数据源编排。子模块职责：
 *              - useSearchFormState（表单草稿）
 *              - useSearchQuery（URL 参数事实源）
 *              - useSearchActions（搜索动作）
 *              - useSearchResults（列表数据加载）
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "@/lib/compat/router-compat";
import { clearApiCache } from "@/core/http";
import type { NoticeItem, PrefsMode } from "../types";
import { useSearchDropdowns } from "./useSearchDropdowns";
import { useSearchFormState } from "./search/useSearchFormState";
import { useSearchQuery } from "./search/useSearchQuery";
import { useSearchActions } from "./search/useSearchActions";
import { useSearchResults } from "./search/useSearchResults";
// N7 收敛（2026-08-20）：PAGE_SIZE 统一从 ../constants 导入
import { PAGE_SIZE } from "../constants";

export { PAGE_SIZE };

export interface UseNoticeSearchOptions {
  userKey: string | undefined;
  page: number;
  setPage: (page: number) => void;
  deepestCodeId: string;
  prefsMode: PrefsMode;
  setPrefsMode: (mode: PrefsMode) => void;
  setSelectedNotice: (notice: NoticeItem | null) => void;
  variantRef: { current: string | undefined };
  onClear?: () => void;
}

export interface UseNoticeSearchReturn {
  query: {
    activeQ: string;
    activeCountry: string;
    activeAgency: string;
    activeFrom: string;
    activeTo: string;
    activeSort: "deadline" | "latest" | "deadline_farthest";
    activeWindow: string;
    activeNoticeType: string;
    activeFeatured: boolean;
    hasSearch: boolean;
    searchKey: string;
  };
  form: {
    qInput: string;
    setQInput: (value: string) => void;
    countryInput: string;
    setCountryInput: (value: string) => void;
    agencyInput: string;
    setAgencyInput: (value: string) => void;
    fromInput: string;
    setFromInput: (value: string) => void;
    toInput: string;
    setToInput: (value: string) => void;
    windowInput: string;
    setWindowInput: (value: string) => void;
    typeInput: string;
    setTypeInput: (value: string) => void;
  };
  result: {
    countries: Array<{ country: string; count: number }>;
    agencies: Array<{ agency: string; count: number }>;
    items: NoticeItem[];
    total: number;
    serverPageSize: number;
    totalPages: number;
    loading: boolean;
    error: string;
    setError: (message: string) => void;
  };
  actions: {
    applySearch: (sortOverride?: "deadline" | "latest" | "deadline_farthest") => void;
    clearSearch: () => void;
    toggleFeatured: () => void;
  };
}

export function useNoticeSearch(options: UseNoticeSearchOptions): UseNoticeSearchReturn {
  const {
    userKey,
    page,
    setPage,
    deepestCodeId,
    prefsMode,
    setPrefsMode,
    setSelectedNotice,
    variantRef,
    onClear,
  } = options;
  const [searchParams] = useSearchParams();
  const { countries, agencies } = useSearchDropdowns();

  // 子 hooks
  const form = useSearchFormState();
  const query = useSearchQuery(deepestCodeId);
  const actions = useSearchActions({
    inputs: form.inputs,
    query,
    deepestCodeId,
    prefsMode,
    setPrefsMode,
    setPage,
    setSelectedNotice,
    clearForm: form.clear,
    onClear,
  });
  const results = useSearchResults({
    query,
    page,
    deepestCodeId,
    prefsMode,
    userKey,
    variantRef,
  });

  // URL 外部变化时同步表单草稿
  useEffect(() => {
    form.syncFromUrl({
      q: query.activeQ,
      country: query.activeCountry,
      agency: query.activeAgency,
      from: query.activeFrom,
      to: query.activeTo,
      window: query.activeWindow,
      type: query.activeNoticeType,
    });
  }, [query.activeQ, query.activeCountry, query.activeAgency, query.activeFrom, query.activeTo, query.activeWindow, query.activeNoticeType]);

  // 组件挂载时立即从 URL 同步表单状态
  useEffect(() => {
    form.syncFromUrl({
      q: query.activeQ,
      country: query.activeCountry,
      agency: query.activeAgency,
      from: query.activeFrom,
      to: query.activeTo,
      window: query.activeWindow,
      type: query.activeNoticeType,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 搜索条件变化时重置分页
  const prevSearchKeyRef = useRef(query.searchKey);
  useEffect(() => {
    if (prevSearchKeyRef.current === query.searchKey) return;
    prevSearchKeyRef.current = query.searchKey;
    setPage(1);
  }, [query.searchKey, setPage]);

  // 账号切换时主动清除缓存（前缀覆盖旧端点与 unified-search 两类缓存键）
  const prevUserKeyForCacheRef = useRef(userKey);
  useEffect(() => {
    if (prevUserKeyForCacheRef.current !== userKey) {
      prevUserKeyForCacheRef.current = userKey;
      clearApiCache("/api/notices");
    }
  }, [userKey]);

  return {
    query: {
      activeQ: query.activeQ,
      activeCountry: query.activeCountry,
      activeAgency: query.activeAgency,
      activeFrom: query.activeFrom,
      activeTo: query.activeTo,
      activeSort: query.activeSort,
      activeWindow: query.activeWindow,
      activeNoticeType: query.activeNoticeType,
      activeFeatured: query.activeFeatured,
      hasSearch: query.hasSearch,
      searchKey: query.searchKey,
    },
    form: {
      qInput: form.inputs.qInput,
      setQInput: form.setters.setQInput,
      countryInput: form.inputs.countryInput,
      setCountryInput: form.setters.setCountryInput,
      agencyInput: form.inputs.agencyInput,
      setAgencyInput: form.setters.setAgencyInput,
      fromInput: form.inputs.fromInput,
      setFromInput: form.setters.setFromInput,
      toInput: form.inputs.toInput,
      setToInput: form.setters.setToInput,
      windowInput: form.inputs.windowInput,
      setWindowInput: form.setters.setWindowInput,
      typeInput: form.inputs.typeInput,
      setTypeInput: form.setters.setTypeInput,
    },
    result: {
      countries,
      agencies,
      items: results.items,
      total: results.total,
      serverPageSize: results.serverPageSize,
      totalPages: results.totalPages,
      loading: results.loading,
      error: results.error,
      setError: results.setError,
    },
    actions: {
      applySearch: actions.applySearch,
      clearSearch: actions.clearSearch,
      toggleFeatured: actions.toggleFeatured,
    },
  };
}
