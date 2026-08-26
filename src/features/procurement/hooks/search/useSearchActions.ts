/**
 * 搜索动作 Hook
 * Search Actions Hook
 *
 * @module features/procurement/hooks/search/useSearchActions
 */
import { useCallback, useRef } from "react";
import { useSearchParams } from "@/lib/compat/router-compat";
import { clearApiCache } from "@/core/http";
import type { NoticeItem, PrefsMode } from "../../types";
import type { SearchFormInputs } from "./useSearchFormState";
import type { SearchQuery } from "./useSearchQuery";

export interface SearchActionsOptions {
  inputs: SearchFormInputs;
  query: SearchQuery;
  deepestCodeId: string;
  prefsMode: PrefsMode;
  setPrefsMode: (mode: PrefsMode) => void;
  setPage: (page: number) => void;
  setSelectedNotice: (notice: NoticeItem | null) => void;
  clearForm: () => void;
  onClear?: () => void;
}

export interface SearchActions {
  applySearch: (sortOverride?: "deadline" | "latest" | "deadline_farthest") => void;
  clearSearch: () => void;
  toggleFeatured: () => void;
  markUserSubmitted: () => void;
}

export function useSearchActions(options: SearchActionsOptions): SearchActions {
  const {
    inputs,
    query,
    deepestCodeId,
    prefsMode,
    setPrefsMode,
    setPage,
    setSelectedNotice,
    clearForm,
    onClear,
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const userSubmittedRef = useRef(false);

  const markUserSubmitted = useCallback(() => {
    userSubmittedRef.current = true;
  }, []);

  const applySearch = useCallback((sortOverride?: "deadline" | "latest" | "deadline_farthest") => {
    userSubmittedRef.current = true;
    clearApiCache("/api/notices");

    const next: Record<string, string> = {};
    if (inputs.qInput.trim()) next.q = inputs.qInput.trim();
    if (inputs.countryInput) next.country = inputs.countryInput;
    if (inputs.agencyInput) next.agency = inputs.agencyInput;
    if (inputs.fromInput) next.deadline_from = inputs.fromInput;
    if (inputs.toInput) next.deadline_to = inputs.toInput;
    if (inputs.windowInput) next.deadline_within_days = inputs.windowInput;
    if (inputs.typeInput.trim()) next.notice_type = inputs.typeInput.trim();
    if (query.activeFeatured) next.featured = "1";
    if (deepestCodeId) next.code_id = deepestCodeId;
    const sortValue = sortOverride ?? query.activeSort;
    if (sortValue !== "deadline_farthest") next.sort = sortValue;
    // 统一化重构：不再强制退出行业匹配模式，仅在全量搜索模式下更新 URL 参数
    // 行业匹配模式下同样更新 URL 参数，后端会叠加筛选
    if (prefsMode === "default") {
      // 全量搜索模式：行为不变
    } else if (prefsMode === "recommended") {
      // 推荐模式：有筛选时退出推荐，进入全量搜索
      setPrefsMode("default");
    }
    // prefsMode === "prefs" 时保持行业匹配模式，不强制退出
    setPage(1);
    setSelectedNotice(null);
    setSearchParams(next);
  }, [inputs, query, deepestCodeId, prefsMode, setPrefsMode, setPage, setSelectedNotice, setSearchParams]);

  const toggleFeatured = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (query.activeFeatured) next.delete("featured");
    else next.set("featured", "1");
    // 统一化重构：不再强制退出行业匹配模式
    // 推荐模式下切换精选则退出推荐
    if (prefsMode === "recommended") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    setSearchParams(next);
  }, [searchParams, query.activeFeatured, prefsMode, setPrefsMode, setPage, setSelectedNotice, setSearchParams]);

  const clearSearch = useCallback(() => {
    clearForm();
    // P1 修复：先同步更新所有状态（包括 prefsMode/selectedIds），再清空 URL 参数
    // 避免 setSearchParams 触发 useSearchQuery 重算时其他状态还未就绪，导致冗余请求
    onClear?.();
    setPage(1);
    setSearchParams({});
    userSubmittedRef.current = true;
    clearApiCache("/api/notices");
  }, [clearForm, setPage, setSearchParams, onClear]);

  return {
    applySearch,
    clearSearch,
    toggleFeatured,
    markUserSubmitted,
  };
}
