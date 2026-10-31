/**
 * 别名表变更后的主动失效编排（D4 / Goal 3）
 * Agency alias change → full invalidation orchestration
 *
 * @module server/services/search-sync/agency-alias-refresh
 * @description 别名表变更不在宽表指纹内（ADR 0002）→ 正确传播必须：
 *   清 store/结果两级缓存 → 用新别名重算宽表 buyer_name（fullBackfill）→ 再让 Meili 从新宽表重建。
*   （下拉聚合缓存 2026-10-31 随机构下拉链整体退役，不再有第三级。）
 *   由 ops 改表脚本收尾调用；刻意不加入 search-sync barrel（避免扩大依赖面/成环）。
 */
import type { Pool } from "mysql2/promise";
import { invalidateAgencyAliasCache } from "../agency/alias-store";
import { invalidateSearchCache } from "../search-common/sync-events";
import { requestIndexRebuild } from "../search-common/rebuild-trigger";
import { fullBackfill } from "./sync-scheduler";

/**
 * 别名表变更后调用：先失效别名快照与搜索结果缓存，再用新别名全量重算宽表，最后标记 Meili 全量重建。
 * （下拉聚合缓存 2026-10-31 随机构下拉链整体退役，三级失效少一级。）
 * 顺序不可颠倒：fullBackfill 必须先于 requestIndexRebuild，否则 Meili 读到的仍是旧 buyer_name。
 */
export async function onAgencyAliasesChanged(pool: Pool): Promise<{ backfilled: number }> {
  invalidateAgencyAliasCache();
  invalidateSearchCache();
  const { synced } = await fullBackfill(pool);
  requestIndexRebuild("agency-aliases-changed");
  return { backfilled: synced };
}
