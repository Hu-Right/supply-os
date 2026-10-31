/**
 * 公采搜索服务 — 编排入口
 * Notice search service — orchestration entry
 *
 * @module server/services/notice-search
 * @description 公告搜索的公共支撑层：国家/机构/统计。
 *              检索主链路已统一到 search-orchestrator（Meilisearch 单路检索 +
 *              MySQL 应急降级）；旧版 searchNotices 两阶段编排与 search-pipeline
 *              SQL 管道已随 USE_LEGACY_IMPL 回滚开关一并移除。
 *              子模块职责：types（类型）、countries（国家）、stats（统计）。
 *              [2026-10-31] agencies 子模块整体退役：下拉端点零 fetcher、筛选增强分支
 *              依赖的聚合缓存永久冷态，详见 filter-builder.expandAgency 收编注释。
 */

// ── 子模块 re-export（保持对外 API 不变）──
export type { NoticeSearchParams, NoticeSearchResult, NoticeStatsResult } from "./types";
export { getNoticeStats, getNoticeDailyNew } from "./stats";
export { refreshNoticeCountries, getNoticeCountries, expandCountryAliases, expandCountryAllForms } from "./countries";
export { getHotTopics, clearHotTopicsCache } from "./hot-topics";
export type { HotTopics, HotGroupItem } from "./hot-topics";
// ── 测试辅助 ──
import { clearCountriesCache } from "./countries";
import { clearStatsCache } from "./stats";

export function __testClearAllCaches(): void {
  clearCountriesCache();
  clearStatsCache();
}
