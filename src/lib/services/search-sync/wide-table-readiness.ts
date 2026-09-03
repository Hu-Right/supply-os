/**
 * 宽表就绪检查（架构评估 A2：从 sync-scheduler 抽出的无依赖叶子模块）
 *
 * @module lib/services/search-sync/wide-table-readiness
 * @description 供 search-sync 与 search-orchestrator 双方使用的共享状态：
 *              只依赖 mysql2，不反向依赖任何调用方，从而打断
 *              search-sync/index → sync-scheduler → search-orchestrator → search-sync/index
 *              的四节点模块循环（reference-fast-path 与 detail-fetch 改从本模块导入）。
 *              结果带 1 分钟进程内缓存（与原实现一致）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

let _wideTableReadyCache: { ready: boolean; expires: number } | null = null;
const WIDE_TABLE_READY_CACHE_TTL = 60 * 1000; // 1 分钟

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
