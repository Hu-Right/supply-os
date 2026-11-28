/**
 * 统一搜索编排器 — 参考号精确匹配快速路径
 * Unified search orchestrator — reference exact-match fast path
 *
 * @module server/services/search-orchestrator/reference-fast-path
 * @description q 形似参考号时先查服务表 reference 列精确匹配，命中直接返回，
 *              跳过全文检索（< 1ms）。宽表退役后直读 `notice_public`，零映射。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * 参考号精确匹配。
 * @returns 命中的公告 ID；未命中返回 null
 */
export async function referenceFastPath(pool: Pool, q: string): Promise<number | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;
  try {
    const [rows] = await pool.query(
      `SELECT notice_pk FROM notice_public
        WHERE reference = ?
          AND (deadline_ts IS NULL OR deadline_ts = 0 OR deadline_ts >= UNIX_TIMESTAMP(NOW()))
        LIMIT 1`,
      [trimmed],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? Number(row.notice_pk) : null;
  } catch {
    return null;
  }
}
