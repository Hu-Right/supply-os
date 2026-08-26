/**
 * 采购机构下拉数据源 — 对外入口
 * Agency dropdown data source — Public Entry
 *
 * @module server/services/notice-search/agencies
 */
import type { Pool } from "mysql2/promise";
import type { AgencyCacheItem } from "../types";
import { getNoticeAgencies as _getNoticeAgencies, getAgencyCacheData, clearAgenciesCache, setAgencyCacheData } from "./cache";
import { refreshNoticeAgencies as _refreshNoticeAgencies } from "./query";

// Re-export
export { getAgencyCacheData, clearAgenciesCache };
export { TYPE_KEY_SQL_PATTERNS } from "./query";

/** 从数据库重新查询并刷新机构缓存 */
export async function refreshNoticeAgencies(pool: Pool): Promise<AgencyCacheItem[]> {
  return _refreshNoticeAgencies(pool);
}

/** 读取机构缓存，按 locale 解析翻译名 */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  return _getNoticeAgencies(pool, locale, _refreshNoticeAgencies);
}
