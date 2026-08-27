/**
 * 公采搜索服务 — 编排入口
 * Notice search service — orchestration entry
 *
 * @module server/services/notice-search
 * @description 公告搜索的公共支撑层：缓存管理、国家/机构/统计缓存、补翻触发。
 *              检索主链路已统一到 search-orchestrator（Meilisearch 单路检索 +
 *              MySQL 应急降级）；旧版 searchNotices 两阶段编排与 search-pipeline
 *              SQL 管道已随 USE_LEGACY_IMPL 回滚开关一并移除。
 *              子模块职责：types（类型）、cache（缓存）、countries（国家）、
 *              agencies（机构）、stats（统计）。
 */
import "server-only";

// ── 子模块 re-export（保持对外 API 不变）──
export type { NoticeSearchParams, NoticeSearchResult, AgencyCacheItem, NoticeStatsResult } from "./types";
export {
  refreshNoticeStats, getNoticeStats, statsKeyFor, getStatsCount,
} from "./stats";
export { refreshNoticeCountries, getNoticeCountries, expandCountryAliases, expandCountryAllForms } from "./countries";
export { refreshNoticeAgencies, getNoticeAgencies, getAgencyCacheData } from "./agencies";
export {
  noticeSearchCache, featuredCountCache,
  searchCacheKey, countCacheKey,
  getCountCache, setCountCache,
  NOTICE_SEARCH_CACHE_TTL, NOTICE_SEARCH_CACHE_MAX,
  NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_TTL_KEYWORD, NOTICE_COUNT_CACHE_MAX,
  FEATURED_COUNT_CACHE_TTL,
} from "./cache";

// ── 测试辅助 ──
import { clearAllCaches } from "./cache";
import { clearCountriesCache } from "./countries";
import { clearAgenciesCache } from "./agencies";
import { clearStatsCache } from "./stats";

export function __testClearAllCaches(): void {
  clearAllCaches();
  clearCountriesCache();
  clearAgenciesCache();
  clearStatsCache();
}
