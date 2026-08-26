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
  hasSearch: boolean;
  hasOtherSearch: boolean;
  searchKey: string;
}

export function useSearchQuery(deepestCodeId: string): SearchQuery {
  const searchParams = useSearchParams();

  const activeQ = searchParams.get("q") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeAgency = searchParams.get("agency") || "";
  const activeFrom = searchParams.get("deadline_from") || "";
  const activeTo = searchParams.get("deadline_to") || "";
  const rawSort = searchParams.get("sort");
  const activeSort: "deadline" | "latest" | "deadline_farthest" =
    rawSort === "latest" ? "latest" : rawSort === "deadline" ? "deadline" : "deadline_farthest";
  const activeWindow = searchParams.get("deadline_within_days") || "";
  const activeNoticeType = searchParams.get("notice_type") || "";
  const activeFeatured = searchParams.get("featured") === "1";

  const hasSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured || deepestCodeId
  );

  // 统一化重构后：hasOtherSearch 仅影响推荐模式的退出判定
  // 不再影响行业匹配模式（行业匹配模式下筛选条件直接透传给后端）
  const hasOtherSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured
  );

  const searchKey = `${activeQ}|${activeCountry}|${activeAgency}|${activeFrom}|${activeTo}|${activeSort}|${activeWindow}|${activeNoticeType}|${activeFeatured ? "1" : ""}|${deepestCodeId}`;

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
    hasSearch,
    hasOtherSearch,
    searchKey,
  }), [activeQ, activeCountry, activeAgency, activeFrom, activeTo, activeSort, activeWindow, activeNoticeType, activeFeatured, hasSearch, hasOtherSearch, searchKey]);
}
