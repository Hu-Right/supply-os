/**
 * 搜索可见性清除出口
 * Search Visibility Purge Outlet
 *
 * @module server/services/search-visibility/purge
 * @description 「让某公告对公众不可见」的唯一清除出口：删宽表行 + 联动删 Meilisearch
 *              文档 + 失效搜索结果缓存。平台公告状态转非发布、外部后台删除公告等场景
 *              必须走本出口，禁止各处再各写一份 DELETE（口径分叉是宽表震荡缺陷的根因）。
 *
 *              与 I1（宽表单一写入者）的关系：本模块只做**删除**，不写任何业务列内容；
 *              内容写入的唯一路径仍是 buildWideRow → upsertWideRows。
 *
 *              级联语义复用 syncNoticeIds：宽表行已删 + 主表行不可公开可见 ⇒ 删索引文档
 *              （见 meilisearch/sync.ts 的 ghost 判定），不在此处直连 Meili 客户端，
 *              避免第二套「删除文档」实现与重试/降级路径分叉。
 */
import type { Pool } from "mysql2/promise";
import { syncNoticeIds } from "../meilisearch";
import { invalidateSearchCache } from "../search-common/sync-events";

/** 单批 IN 上限：与 sync-scheduler 的增量批同量级，避免超长 IN 语句 */
const PURGE_BATCH = 500;

/**
 * 从搜索侧彻底移除指定公告（宽表行 + 索引文档 + 结果缓存）。
 * @returns 宽表实际删除行数
 */
export async function purgeNoticeSearch(pool: Pool, ids: number[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (clean.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < clean.length; i += PURGE_BATCH) {
    const batch = clean.slice(i, i + PURGE_BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const [res] = await pool.query(
      `DELETE FROM crm_notice_search WHERE id IN (${placeholders})`,
      batch,
    );
    deleted += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    // 级联删索引文档：宽表已无行 + 主表不可公开可见 → syncNoticeIds 的 ghost 判定命中删除分支
    await syncNoticeIds(pool, batch).catch((err: unknown) => {
      console.warn("[search-purge] Meilisearch 级联删除失败（交由定时对账兜底）:", (err as Error).message);
    });
  }
  invalidateSearchCache();
  return deleted;
}
