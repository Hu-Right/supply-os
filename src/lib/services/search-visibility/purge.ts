/**
 * 搜索侧下架（宽表退役后的零映射版）
 *
 * @module lib/services/search-visibility/purge
 * @description 2026-11-28：宽表退役后不再有“删宽表行 = 从搜索消失”这条路径。
 *              下架改为三件事，全部不触碰服务表（服务表由构建准入 `PUBLIC_ADMIT_SQL`
 *              决定是否入表，重建不会把已下架行写回来）：
 *
 *              1. 删 Meili 索引文档（ghost 判定：主表不可公开可见 → 删除）；
 *              2. 删节点码倒排表 `notice_search_node` 里的行；
 *              3. 失效搜索缓存。
 *
 *              返回值保留为「受影响公告数」，语义从“删宽表行数”变为“请求下架条数”。
 */
import type { Pool } from "mysql2/promise";
import { syncNoticeIds } from "../meilisearch";
import { invalidateSearchCache } from "../search-common/sync-events";
import { deleteNoticeNodes } from "../search-sync/notice-nodes";

/** 单批 IN 上限：与 sync-scheduler 的增量批同量级，避免超长 IN 语句 */
const PURGE_BATCH = 500;

/**
 * 从搜索侧彻底移除指定公告（索引文档 + 节点码倒排 + 结果缓存）。
 * @returns 请求下架的公告数（去重后）
 */
export async function purgeNoticeSearch(pool: Pool, ids: number[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (clean.length === 0) return 0;

  for (let i = 0; i < clean.length; i += PURGE_BATCH) {
    const batch = clean.slice(i, i + PURGE_BATCH);
    // 删索引文档：主表不可公开可见 → syncNoticeIds 的 ghost 判定命中删除分支
    await syncNoticeIds(pool, batch).catch((err: unknown) => {
      console.warn("[search-purge] Meilisearch 级联删除失败（交由定时对账兜底）:", (err as Error).message);
    });
  }
  invalidateSearchCache();
  // 节点码倒排表同样要清：留残行等于「凭空多出一条挂在某个节点码上的公告」。
  try {
    await deleteNoticeNodes(pool, clean);
  } catch (err) {
    console.error(`[notice-nodes] 清除 ${clean.length} 条公告的节点码行失败:`, (err as Error).message);
  }
  return clean.length;
}
