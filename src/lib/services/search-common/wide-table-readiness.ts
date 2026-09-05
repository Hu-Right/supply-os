/**
 * 搜索公共层 — 宽表就绪检查
 * Search Common — wide table readiness check
 *
 * @module lib/services/search-common/wide-table-readiness
 * @description ARCH-P3-解环（2026-09-05）：从 search-sync/wide-table-readiness 迁出，
 *              与 metrics / rebuild-trigger 统一归入 search-common 共享层。
 *              只依赖 mysql2，不反向依赖任何调用方。
 *              结果带 1 分钟进程内缓存。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

let _wideTableReadyCache: { ready: boolean; expires: number } | null = null;
const WIDE_TABLE_READY_CACHE_TTL = 60 * 1000;

/**
 * 检查宽表是否已就绪
 */
export async function isWideTableReady(pool: Pool): Promise<boolean> {
  if (_wideTableReadyCache && _wideTableReadyCache.expires > Date.now()) {
    return _wideTableReadyCache.ready;
  }
  try {
    const [rows] = await pool.query("SELECT 1 FROM crm_notice_search LIMIT 1");
    const ready = (rows as RowDataPacket[]).length > 0;
    _wideTableReadyCache = { ready, expires: Date.now() + WIDE_TABLE_READY_CACHE_TTL };
    return ready;
  } catch {
    _wideTableReadyCache = { ready: false, expires: Date.now() + WIDE_TABLE_READY_CACHE_TTL };
    return false;
  }
}
