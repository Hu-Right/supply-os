/**
 * 搜索 URL 参数事实源 Hook
 * Search URL Params Source of Truth Hook
 *
 * @module features/procurement/hooks/search/useSearchQuery
 */
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export interface SearchQuery {
  activeQ: string;
  activeCountry: string;
  activeAgency: string;
  activeFrom: string;
  activeTo: string;
  activeSort: "deadline" | "latest" | "deadline_farthest";
  activeWindow: string;
  activeNoticeType: string;
  activeFeatured: boolean;
  activeBudgetMin: string;
  activeBudgetMax: string;
  /** 品目大类码（URL group=UGT-G-xx；32 类 chip 与五级下拉第一级同一事实源） */
  activeGroup: string;
  /** 品目树筛选键（URL commodity=UGT 节点码，五级下拉第二~五级） */
  activeCommodity: string;
  /** 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中） */
  activeMatchMode: "all" | "any";
  hasSearch: boolean;
  hasOtherSearch: boolean;
  searchKey: string;
}

export function useSearchQuery(): SearchQuery {
  const searchParams = useSearchParams();

  const activeQ = searchParams.get("q") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeAgency = searchParams.get("agency") || "";
  const activeFrom = searchParams.get("deadline_from") || "";
  const activeTo = searchParams.get("deadline_to") || "";
  const rawSort = searchParams.get("sort");
  const activeSort: "deadline" | "latest" | "deadline_farthest" =
    rawSort === "deadline" ? "deadline" : rawSort === "deadline_farthest" ? "deadline_farthest" : "latest";
  const activeWindow = searchParams.get("deadline_within_days") || "";
  const activeNoticeType = searchParams.get("notice_type") || "";
  const activeFeatured = searchParams.get("featured") === "1";
  const activeBudgetMin = searchParams.get("budget_min") || "";
  const activeBudgetMax = searchParams.get("budget_max") || "";
  const activeMatchMode: "all" | "any" = searchParams.get("match_mode") === "any" ? "any" : "all";
  const activeGroup = searchParams.get("group") || "";
  const activeCommodity = searchParams.get("commodity") || "";

  const hasSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured ||
    activeBudgetMin || activeBudgetMax || activeGroup || activeCommodity
  );

  // 统一化重构后：hasOtherSearch 仅影响推荐模式的退出判定
  // 不再影响行业匹配模式（行业匹配模式下筛选条件直接透传给后端）
  const hasOtherSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured ||
    activeBudgetMin || activeBudgetMax || activeGroup || activeCommodity
  );

  const searchKey = `${activeQ}|${activeCountry}|${activeAgency}|${activeFrom}|${activeTo}|${activeSort}|${activeWindow}|${activeNoticeType}|${activeFeatured ? "1" : ""}|${activeBudgetMin}|${activeBudgetMax}|${activeMatchMode}|${activeGroup}|${activeCommodity}`;

  return useMemo(() => ({
    activeQ,
    activeCountry,
    activeAgency,
    activeFrom,
    activeTo,
    activeSort,
    activeWindow,
    activeNoticeType,
    activeFeatured,
    activeBudgetMin,
    activeBudgetMax,
    activeGroup,
    activeCommodity,
    activeMatchMode,
    hasSearch,
    hasOtherSearch,
    searchKey,
  }), [activeQ, activeCountry, activeAgency, activeFrom, activeTo, activeSort, activeWindow, activeNoticeType, activeFeatured, activeBudgetMin, activeBudgetMax, activeGroup, activeCommodity, activeMatchMode, hasSearch, hasOtherSearch, searchKey]);
}
