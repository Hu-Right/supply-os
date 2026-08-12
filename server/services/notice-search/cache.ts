/**
 * 搜索结果缓存管理
 * Search result cache management
 *
 * @module server/services/notice-search/cache
 * @description 集中管理搜索/计数/精选三类内存缓存，提供统一的 TTL + LRU 淘汰策略。
 */
import type { NoticeSearchParams, NoticeSearchResult } from "./types";

// ── 搜索结果缓存 ──
export const noticeSearchCache = new Map<string, { payload: NoticeSearchResult; expires: number }>();
export const NOTICE_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
export const NOTICE_SEARCH_CACHE_MAX = 500;

// ── COUNT 缓存 ──
export const noticeCountCache = new Map<string, { total: number; expires: number }>();
export const NOTICE_COUNT_CACHE_TTL = 10 * 60 * 1000; // 10 分钟
export const NOTICE_COUNT_CACHE_MAX = 500;

// ── 精选计数缓存 ──
// 修复：TTL 从 30 分钟缩短为 10 分钟，与统计表刷新周期对齐，避免精选总数延迟更新
export const featuredCountCache = { total: 0, expires: 0 };
export const FEATURED_COUNT_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

// ── 采购类型映射缓存 ──
export let _noticeTypeCache: { types: string[]; expires: number } | null = null;
export const NOTICE_TYPE_CACHE_TTL = 10 * 60 * 1000; // 10 min

export function setNoticeTypeCache(value: { types: string[]; expires: number }): void {
  _noticeTypeCache = value;
}

/** 搜索缓存 key（含分页参数） */
export function searchCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    p.page, p.pageSize, p.codeId || 0, p.q || "", p.country || "", p.agency || "",
    p.deadlineFrom || "", p.deadlineTo || "", p.sort || "deadline_farthest",
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly, p.locale || "",
  ]);
}

/** COUNT 缓存 key：与 searchCacheKey 相同但不含 page/pageSize/sort（翻页和排序不影响总数） */
export function countCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    "count", p.codeId || 0, p.q || "", p.country || "", p.agency || "",
    p.deadlineFrom || "", p.deadlineTo || "",
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly,
  ]);
}

/** 清除所有搜索/计数/精选/类型缓存（测试辅助） */
export function clearAllCaches(): void {
  noticeSearchCache.clear();
  noticeCountCache.clear();
  featuredCountCache.total = 0;
  featuredCountCache.expires = 0;
  _noticeTypeCache = null;
}
