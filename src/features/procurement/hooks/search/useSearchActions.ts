/**
 * 搜索动作 Hook
 * Search Actions Hook
 *
 * @module features/procurement/hooks/search/useSearchActions
 */
import { useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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

/** 将 Record 构建为 URL 查询字符串 */
function buildQs(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
    if (prefsMode === "default") {
      // 全量搜索模式：行为不变
    } else if (prefsMode === "recommended") {
      setPrefsMode("default");
    }
    setPage(1);
    setSelectedNotice(null);
    const qs = buildQs(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [inputs, query, deepestCodeId, prefsMode, setPrefsMode, setPage, setSelectedNotice, router, pathname]);

  const toggleFeatured = useCallback(() => {
    const next = new URLSearchParams(searchParams ?? undefined);
    if (query.activeFeatured) next.delete("featured");
    else next.set("featured", "1");
    if (prefsMode === "recommended") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, query.activeFeatured, prefsMode, setPrefsMode, setPage, setSelectedNotice, router, pathname]);

  const clearSearch = useCallback(() => {
    clearForm();
    onClear?.();
    setPage(1);
    router.replace(pathname, { scroll: false });
    userSubmittedRef.current = true;
    clearApiCache("/api/notices");
  }, [clearForm, setPage, router, pathname, onClear]);

  return {
    applySearch,
    clearSearch,
    toggleFeatured,
    markUserSubmitted,
  };
}
