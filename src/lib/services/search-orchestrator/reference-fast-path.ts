/**
 * 统一搜索编排器 — 参考号精确匹配快速路径
 * Unified search orchestrator — reference exact-match fast path
 *
 * @module server/services/search-orchestrator/reference-fast-path
 * @description q 形似参考号时先查宽表 reference 列精确匹配，命中直接返回，
 *              跳过全文检索（< 1ms）。与旧 searchNotices 的快速路径行为一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
// A2 解环：直接从无依赖叶子模块导入，不经过 search-sync barrel（避免循环回环）
import { isWideTableReady } from "../search-common/wide-table-readiness";

/**
 * 参考号精确匹配。
 * @returns 命中的公告 ID；未命中或宽表未就绪返回 null
 */
export async function referenceFastPath(pool: Pool, q: string): Promise<number | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;
  try {
    const wideReady = await isWideTableReady(pool);
    if (!wideReady) return null;
    const [rows] = await pool.query(
      `SELECT id FROM crm_notice_search
       WHERE reference = ?
         AND (deadline_sec = 0 OR deadline_sec >= UNIX_TIMESTAMP(NOW()))
       LIMIT 1`,
      [trimmed],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? Number(row.id) : null;
  } catch {
    return null;
  }
}
