/**
 * 国家别名表变更后的主动失效编排（对齐 agency-alias-refresh）
 * Country alias change → full invalidation orchestration
 *
 * @module server/services/search-sync/country-alias-refresh
 * @description country_aliases 不在宽表指纹内 → 正确传播必须：
 *   清 store/下拉/结果三级缓存 → 用新表重算宽表 country_name/country_codes（fullBackfill）→ 再让 Meili 从新宽表重建。
 *   由 ops 改表脚本收尾调用；刻意不加入 search-sync barrel（避免扩大依赖面/成环）。
 */
import type { Pool } from "mysql2/promise";
import { invalidateCountryAliasCache } from "../country/alias-store";
import { clearCountriesCache } from "../notice-search/countries";
import { invalidateSearchCache } from "../search-common/sync-events";
import { requestIndexRebuild } from "../search-common/rebuild-trigger";
import { fullBackfill } from "./sync-scheduler";

/**
 * 国家别名表变更后调用：先失效三级缓存，再用新表全量重算宽表，最后标记 Meili 全量重建。
 * 顺序不可颠倒：fullBackfill 必须先于 requestIndexRebuild，否则 Meili 读到的仍是旧 country_codes。
 */
export async function onCountryAliasesChanged(pool: Pool): Promise<{ backfilled: number }> {
  invalidateCountryAliasCache();
  clearCountriesCache();
  invalidateSearchCache();
  const { synced } = await fullBackfill(pool);
  requestIndexRebuild("country-aliases-changed");
  return { backfilled: synced };
}
