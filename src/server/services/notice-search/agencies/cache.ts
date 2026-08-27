/**
 * 机构缓存管理
 * Agency Cache Management
 *
 * @module server/services/notice-search/agencies/cache
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import type { AgencyCacheItem } from "../types";

let noticeAgenciesCache: { data: AgencyCacheItem[]; timestamp: number } | null = null;
const AGENCIES_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

// Promise 去重——并发请求共享同一个刷新 Promise
let _pendingAgenciesRefresh: Promise<AgencyCacheItem[]> | null = null;

/** 读取机构缓存，按 locale 解析翻译名 */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
  refreshFn?: (pool: Pool) => Promise<AgencyCacheItem[]>,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  const cacheValid = noticeAgenciesCache && Date.now() - noticeAgenciesCache.timestamp < AGENCIES_CACHE_TTL;
  let items: AgencyCacheItem[];
  if (cacheValid) {
    items = noticeAgenciesCache!.data;
  } else {
    if (!_pendingAgenciesRefresh) {
      if (!refreshFn) throw new Error("refreshFn required when cache expired");
      _pendingAgenciesRefresh = refreshFn(pool).finally(() => {
        _pendingAgenciesRefresh = null;
      });
    }
    items = await _pendingAgenciesRefresh;
  }
  const lang = locale?.toLowerCase();
  if (!lang || lang === "en") {
    return items.map(({ agency, count }) => ({ agency, count }));
  }
  return items.map(({ agency, count, i18n }) => {
    const translated = i18n?.[lang];
    const isValidTranslation = translated && translated !== agency;
    return isValidTranslation ? { agency, count, agency_i18n: translated } : { agency, count };
  });
}

/** 获取机构缓存原始数据 */
export function getAgencyCacheData(): AgencyCacheItem[] | null {
  return noticeAgenciesCache?.data ?? null;
}

/** 设置机构缓存 */
export function setAgencyCacheData(data: AgencyCacheItem[]): void {
  noticeAgenciesCache = { data, timestamp: Date.now() };
}

/** 清除机构缓存 */
export function clearAgenciesCache(): void {
  noticeAgenciesCache = null;
  _pendingAgenciesRefresh = null;
}
