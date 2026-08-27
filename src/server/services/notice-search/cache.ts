/**
 * 搜索结果缓存管理
 * Search result cache management
 *
 * @module server/services/notice-search/cache
 * @description 集中管理搜索/计数/精选三类内存缓存。
 *              搜索缓存和计数缓存均使用 LRUCache（O(1) 淘汰 + 自动过期），
 *              替代旧版 Map + 手动 O(n) 遍历清理。
 */
import "server-only";
import { LRUCache } from "lru-cache";
import type { NoticeSearchParams, NoticeSearchResult } from "./types";

// ── 搜索结果缓存（LRUCache：5 分钟 TTL，最多 500 条）──
export const NOTICE_SEARCH_CACHE_TTL = 5 * 60 * 1000;
export const NOTICE_SEARCH_CACHE_MAX = 500;
export const noticeSearchCache = new LRUCache<string, NoticeSearchResult>({
  max: NOTICE_SEARCH_CACHE_MAX,
  ttl: NOTICE_SEARCH_CACHE_TTL,
});

// ── COUNT 缓存（双 TTL：关键词 30min / 非关键词 10min）──
export const NOTICE_COUNT_CACHE_TTL = 10 * 60 * 1000;
export const NOTICE_COUNT_CACHE_TTL_KEYWORD = 30 * 60 * 1000;
export const NOTICE_COUNT_CACHE_MAX = 500;

const _countCacheRegular = new LRUCache<string, number>({
  max: NOTICE_COUNT_CACHE_MAX,
  ttl: NOTICE_COUNT_CACHE_TTL,
});
const _countCacheKeyword = new LRUCache<string, number>({
  max: NOTICE_COUNT_CACHE_MAX,
  ttl: NOTICE_COUNT_CACHE_TTL_KEYWORD,
});

/** 读取 COUNT 缓存；未命中返回 undefined */
export function getCountCache(key: string, isKeyword: boolean): number | undefined {
  return isKeyword ? _countCacheKeyword.get(key) : _countCacheRegular.get(key);
}

/** 写入 COUNT 缓存（根据是否含关键词选择 TTL） */
export function setCountCache(key: string, isKeyword: boolean, total: number): void {
  (isKeyword ? _countCacheKeyword : _countCacheRegular).set(key, total);
}

/** 清除所有 COUNT 缓存（统计表刷新时调用） */
export function clearCountCaches(): void {
  _countCacheRegular.clear();
  _countCacheKeyword.clear();
}

// ── 精选计数缓存 ──
export const featuredCountCache = { total: 0, expires: 0 };
export const FEATURED_COUNT_CACHE_TTL = 10 * 60 * 1000;

// ── 采购类型映射缓存 ──
export let _noticeTypeCache: { types: string[]; expires: number } | null = null;
export const NOTICE_TYPE_CACHE_TTL = 10 * 60 * 1000;

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
  _countCacheRegular.clear();
  _countCacheKeyword.clear();
  featuredCountCache.total = 0;
  featuredCountCache.expires = 0;
  _noticeTypeCache = null;
}
