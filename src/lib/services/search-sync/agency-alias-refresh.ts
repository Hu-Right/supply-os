/**
 * 别名表变更后的主动失效编排（D4 / Goal 3）
 * Agency alias change → full invalidation orchestration
 *
 * @module server/services/search-sync/agency-alias-refresh
 * @description 别名表变更不在宽表指纹内（ADR 0002）→ 正确传播必须：
 *   清 store/下拉/结果三级缓存 → 用新别名重算宽表 agency_std（fullBackfill）→ 再让 Meili 从新宽表重建。
 *   由 ops 改表脚本收尾调用；刻意不加入 search-sync barrel（避免扩大依赖面/成环）。
 */
import type { Pool } from "mysql2/promise";
import { invalidateAgencyAliasCache } from "../agency/alias-store";
import { clearAgenciesCache } from "../notice-search/agencies";
import { invalidateSearchCache } from "../search-common/sync-events";
import { requestIndexRebuild } from "../search-common/rebuild-trigger";
import { fullBackfill } from "./sync-scheduler";

/**
 * 别名表变更后调用：先失效三级缓存，再用新别名全量重算宽表，最后标记 Meili 全量重建。
 * 顺序不可颠倒：fullBackfill 必须先于 requestIndexRebuild，否则 Meili 读到的仍是旧 agency_std。
 */
export async function onAgencyAliasesChanged(pool: Pool): Promise<{ backfilled: number }> {
  invalidateAgencyAliasCache();
  clearAgenciesCache();
  invalidateSearchCache();
  const { synced } = await fullBackfill(pool);
  requestIndexRebuild("agency-aliases-changed");
  return { backfilled: synced };
}
