/**
 * 搜索行为统计（真实热门搜索）— 统一导出入口
 *
 * @module server/services/search-analytics
 */
export {
  computeHotTerms,
  decideHotMode,
  normalizeSearchTerm,
  isBotUserAgent,
  isLikelyReferenceCode,
  visitorHash,
  HOT_SEARCH_DEFAULTS,
} from "./hot-search-core";
export type {
  HotSearchMode,
  HotSearchTerm,
  HotSearchVisitorRow,
  HotSearchOptions,
} from "./hot-search-core";
export {
  getHotSearches,
  cleanupOldSearchLogs,
  clearHotSearchesCache,
  excludedSearchUserIds,
  hotSearchHref,
  hotSearchConfig,
} from "./hot-search";
export type { HotSearchesResult, GetHotSearchesOptions } from "./hot-search";
