/**
 * 国家别名表变更后的主动失效编排
 *
 * @module server/services/search-sync/country-alias-refresh
 * @description 2026-11-28 宽表退役：原实现靠 `fullBackfill` 重算宽表再重建 Meili。
 *              现在 `country_code/country_codes` 是服务表构建期快照，别名表变更后
 *              必须**重建服务表**才能生效；本函数只负责失效缓存并标记索引重建，
 *              服务表全量重建由 ops 脚本（notice-public 全量重建）在发布窗口执行。
 */
import type { Pool } from "mysql2/promise";
import { invalidateCountryAliasCache } from "../country/alias-store";
import { clearCountriesCache } from "../notice-search/countries";
import { invalidateSearchCache } from "../search-common/sync-events";
import { requestIndexRebuild } from "../search-common/rebuild-trigger";

/**
 * 国家别名表变更后调用：失效三级缓存 + 标记 Meili 全量重建。
 * ⚠️ 调用方必须同时排一次服务表全量重建，否则索引重灌读到的仍是旧 country_code。
 */
export async function onCountryAliasesChanged(_pool: Pool): Promise<{ backfilled: number }> {
  invalidateCountryAliasCache();
  clearCountriesCache();
  invalidateSearchCache();
  requestIndexRebuild("country-aliases-changed");
  console.warn(
    "[country-alias] 别名表已变更：请执行服务表全量重建设脚本后再等待索引重灌（宽表退役后不再有 fullBackfill 兜底）",
  );
  return { backfilled: 0 };
}
