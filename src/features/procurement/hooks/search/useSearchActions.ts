/**
 * 搜索动作 Hook
 * Search Actions Hook
 *
 * @module features/procurement/hooks/search/useSearchActions
 */
import { useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { clearApiCache } from "@/core/http";
import { composeQ, type TermRow } from "@/shared/utils/advanced-syntax";
import type { NoticeItem, PrefsMode } from "../../types";
import type { SearchFormInputs } from "./useSearchFormState";
import type { SearchQuery } from "./useSearchQuery";

export interface SearchActionsOptions {
  inputs: SearchFormInputs;
  query: SearchQuery;
  prefsMode: PrefsMode;
  setPrefsMode: (mode: PrefsMode) => void;
  setPage: (page: number) => void;
  setSelectedNotice: (notice: NoticeItem | null) => void;
  clearForm: () => void;
  onClear?: () => void;
}

/**
 * 提交时的草稿覆盖项。
 * form 的 dispatch 是异步的：刚 replaceRows / setMatchMode 就立即 applySearch，
 * 函数内读到的 inputs 仍是旧快照，会把刚改的草稿丢在 URL 外。
 * 因此「改状态 + 立刻查」的动作（如选词组即搜索）必须把新草稿显式传进来。
 */
export interface SearchOverrides {
  qInput?: string;
  termRows?: TermRow[];
  matchMode?: "all" | "any";
}

export interface SearchActions {
  applySearch: (
    sortOverride?: "deadline" | "latest" | "deadline_farthest",
    overrides?: SearchOverrides,
  ) => void;
  clearSearch: () => void;
  toggleFeatured: () => void;
  /** 五级下拉某一层选中（level 0=大类→写 group，1~4=中类/小类/子类/品目→写 commodity；key 骨架节点码，空串 = 清空该层）*/
  setCommodityLevel: (level: number, key: string) => void;
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

  const applySearch = useCallback((
    sortOverride?: "deadline" | "latest" | "deadline_farthest",
    overrides?: SearchOverrides,
  ) => {
    userSubmittedRef.current = true;
    clearApiCache("/api/notices");

    const next: Record<string, string> = {};
    // 草稿来源：优先取显式覆盖（适用于刚 dispatch 完就提交的场景），否则取当前表单快照
    const qInput = overrides?.qInput ?? inputs.qInput;
    const termRows = overrides?.termRows ?? inputs.termRows;
    const matchMode = overrides?.matchMode ?? inputs.matchMode;
    // 高级关键词行合成：主关键词 + 包含/排除/短语行 → q（与 Task 2 共享语法一致，服务端截断 200）
    const composedQ = composeQ(qInput, termRows);
    if (composedQ) next.q = composedQ;
    if (inputs.countryInput) next.country = inputs.countryInput;
    if (inputs.agencyInput) next.agency = inputs.agencyInput;
    if (inputs.fromInput) next.deadline_from = inputs.fromInput;
    if (inputs.toInput) next.deadline_to = inputs.toInput;
    if (inputs.windowInput) next.deadline_within_days = inputs.windowInput;
    if (inputs.noticeTypeInput.trim()) next.notice_type = inputs.noticeTypeInput.trim();
    if (query.activeFeatured) next.featured = "1";
    // 以下三项都不在表单里，从 URL 事实源直接携带，否则重新搜索会静默丢筛选：
    // 旧字典入口（首页热门/外链）、大类 chip 与五级下拉共用的 group、五级下拉的品目路径
    if (query.activeCodeId) next.code_id = query.activeCodeId;
    if (query.activeGroup) next.group = query.activeGroup;
    if (query.activeCommodity) next.commodity = query.activeCommodity;
    if (query.activeBudgetMin) next.budget_min = query.activeBudgetMin;
    if (query.activeBudgetMax) next.budget_max = query.activeBudgetMax;
    // 匹配模式：仅显式选 any（任一命中）时写入 URL，默认 all 不写（保持 URL 简洁）
    if (matchMode === "any") next.match_mode = "any";
    const sortValue = sortOverride ?? query.activeSort;
    if (sortValue !== "latest") next.sort = sortValue;
    if (prefsMode === "default") {
      // 全量搜索模式：行为不变
    } else if (prefsMode === "recommended") {
      setPrefsMode("default");
    }
    setPage(1);
    setSelectedNotice(null);
    const qs = buildQs(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [inputs, query, prefsMode, setPrefsMode, setPage, setSelectedNotice, router, pathname]);

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

  /**
   * 五级下拉的任一层选中入 URL（URL 是唯一事实源，level 0=大类、1~4=中类/小类/子类/品目）。
   * commodity 的值就是骨架节点码（UGT-…），与公告侧 backbone_path 同口径，可直接当筛选键。
   * 大类入口只剩这里：原本的 32 类 chip 行因与第一级完全重叠已下线。
   */
  const setCommodityLevel = useCallback((level: number, key: string) => {
    const next = new URLSearchParams(searchParams ?? undefined);
    if (level === 0) {
      if (key) next.set("group", key);
      else next.delete("group");
      // 换大类 ⇒ 更深层路径失效
      next.delete("commodity");
    } else {
      if (key) next.set("commodity", key);
      else next.delete("commodity");
      // 回退到某一层（选中值变短）时，若清空了路径就不再按品目筛；大类仍生效
    }
    if (prefsMode === "recommended") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, prefsMode, setPrefsMode, setPage, setSelectedNotice, router, pathname]);

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
    setCommodityLevel,
    markUserSubmitted,
  };
}
