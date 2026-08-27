/**
 * 公告桥接表脏数据清理服务
 * Notice Bridge Stale Data Cleanup Service
 *
 * @module server/services/data-cleanup/bridge-cleanup
 * @description 比对 crm_bid_notices（主表）与 crm_bid_notice_unspsc_codes（桥接表）
 *              的 notice_id，清理"主表已不存在（或已失效）"的桥接标签行。
 *              供一次性清理脚本（scripts/cleanup-notice-unspsc-bridge.ts）与
 *              后台定时任务（server/lifecycle/timers.ts）复用。
 *
 *              口径说明：主表无 status 列，业务状态以 is_expired 为准
 *              （0=有效，1=已失效，NULL 视为有效——与搜索/推荐路径口径一致）。
 *              默认仅清理"主表完全不存在"的硬死数据；已过期公告的标签
 *              通过 includeExpired 显式开启（过期公告未来若被同步任务
 *              回填桥接时仍可恢复，保守默认不删）。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { createLogger } from "../../utils/fileLogger";
import { type CleanupTarget, type CleanupOptions, type CleanupStats, runStaleDataCleanup, countStaleData } from "./engine";

const logger = createLogger("bridge-cleanup");

/** 桥接表清理目标配置 */
const BRIDGE_TARGET: CleanupTarget = {
  table: "crm_bid_notice_unspsc_codes",
  idColumn: "id",
  joinColumn: "notice_id",
  mainJoinColumn: "notice_id",
  backupPrefix: "crm_bid_notice_unspsc_codes_backup",
};

export interface BridgeCleanupOptions extends CleanupOptions {}
export interface BridgeCleanupStats extends CleanupStats {}

/**
 * 统计桥接表脏数据（只读，不修改任何数据）
 * 供 CLI 脚本 dry-run 模式使用
 */
export async function countStaleBridgeRows(
  pool: Pool,
  includeExpired = false,
): Promise<{ bridgeTotal: number; orphanRows: number; expiredRows: number }> {
  const [totalRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM crm_bid_notice_unspsc_codes",
  );
  const bridgeTotal = Number((totalRows as RowDataPacket[])[0].cnt);

  const [staleRows] = await pool.query(
    `SELECT
       SUM(n.id IS NULL) AS orphan_rows,
       SUM(n.id IS NOT NULL AND n.is_expired = 1) AS expired_rows
     FROM crm_bid_notice_unspsc_codes b
     LEFT JOIN crm_bid_notices n ON n.notice_id = b.notice_id`,
  );
  const row = (staleRows as RowDataPacket[])[0];
  return {
    bridgeTotal,
    orphanRows: Number(row.orphan_rows || 0),
    expiredRows: Number(row.expired_rows || 0),
  };
}

/**
 * 清理桥接表脏数据
 */
export async function cleanupStaleNoticeBridge(
  pool: Pool,
  options: BridgeCleanupOptions = {},
): Promise<BridgeCleanupStats> {
  return runStaleDataCleanup(pool, BRIDGE_TARGET, options, logger);
}
