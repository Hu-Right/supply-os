/**
 * 公告桥接表脏数据清理服务
 * Notice bridge stale-data cleanup service
 *
 * @module server/services/noticeBridgeSync
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
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createLogger } from "../utils/fileLogger";

const logger = createLogger("bridge-cleanup");

const DEFAULT_BATCH_SIZE = 5000;

export interface BridgeCleanupOptions {
  /** 是否同时清理已过期公告（is_expired=1）的标签，默认 false */
  includeExpired?: boolean;
  /** 删除批次大小，默认 5000 */
  batchSize?: number;
  /** 删除前是否备份到临时表，默认 true */
  backup?: boolean;
}

export interface BridgeCleanupStats {
  /** 清理前桥接表总行数 */
  bridgeTotal: number;
  /** 主表不存在的死数据行数 */
  orphanRows: number;
  /** 主表存在但已过期（is_expired=1）的行数 */
  expiredRows: number;
  /** 本次实际待删除行数 */
  toDelete: number;
  /** 备份表名（未备份为 null） */
  backupTable: string | null;
  /** 实际删除行数（dry-run 为 0） */
  deleted: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/** 构造删除/备份 WHERE 条件：LEFT JOIN 主表后筛选目标行 */
function buildStaleWhere(includeExpired: boolean): string {
  return includeExpired ? "(n.id IS NULL OR n.is_expired = 1)" : "n.id IS NULL";
}

/** 生成当日备份表名：crm_bid_notice_unspsc_codes_backup_YYYYMMDD */
function backupTableName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `crm_bid_notice_unspsc_codes_backup_${yyyy}${mm}${dd}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * 清理桥接表脏数据：一次 LEFT JOIN 取 ID + 统计 → 备份 → 分批删除 → 报告。
 * 优化：合并原先的三次 LEFT JOIN（统计 + 备份 + ID 提取）为一次，
 * 备份和删除复用已提取的 ID 列表，避免重复全表关联。
 */
export async function cleanupStaleNoticeBridge(
  pool: Pool,
  options: BridgeCleanupOptions = {},
): Promise<BridgeCleanupStats> {
  const startedAt = Date.now();
  const batchSize = Math.max(1, Math.floor(Number(options.batchSize || DEFAULT_BATCH_SIZE)));
  const includeExpired = Boolean(options.includeExpired);
  const withBackup = options.backup !== false;

  // ── Step 1: 一次查询获取桥接表总数 + 待删行 ID + 统计值 ──
  const [totalRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM crm_bid_notice_unspsc_codes",
  );
  const bridgeTotal = Number((totalRows as RowDataPacket[])[0].cnt);

  const where = buildStaleWhere(includeExpired);
  const [staleRows] = await pool.query(
    `SELECT b.id,
            SUM(n.id IS NULL) OVER() AS orphan_rows,
            SUM(n.id IS NOT NULL AND n.is_expired = 1) OVER() AS expired_rows
     FROM crm_bid_notice_unspsc_codes b
     LEFT JOIN crm_bid_notices n ON n.notice_id = b.notice_id
     WHERE ${where}`,
  );
  const staleData = staleRows as RowDataPacket[];
  const orphanRows = staleData.length > 0 ? Number(staleData[0].orphan_rows || 0) : 0;
  const expiredRows = staleData.length > 0 ? Number(staleData[0].expired_rows || 0) : 0;
  const toDelete = orphanRows + (includeExpired ? expiredRows : 0);
  const staleIds = staleData.map((r) => Number(r.id));

  logger.info(
    `扫描完成: 桥接表 ${bridgeTotal} 行，死数据 ${orphanRows} 行，已过期 ${expiredRows} 行，待删除 ${toDelete} 行`,
  );

  // ── Step 2: 备份（复用已提取的 ID，走主键索引而非 LEFT JOIN）──
  let backupTable: string | null = null;
  if (staleIds.length > 0 && withBackup) {
    backupTable = backupTableName();
    const [exists] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [backupTable],
    );
    const existsCount = Number((exists as RowDataPacket[])[0].cnt);
    const ph = staleIds.map(() => "?").join(",");
    if (existsCount > 0) {
      await pool.query(
        `INSERT INTO ${backupTable} SELECT * FROM crm_bid_notice_unspsc_codes WHERE id IN (${ph})`,
        staleIds,
      );
    } else {
      await pool.query(
        `CREATE TABLE ${backupTable} AS SELECT * FROM crm_bid_notice_unspsc_codes WHERE id IN (${ph})`,
        staleIds,
      );
    }
    logger.info(`已备份 ${staleIds.length} 行到 ${backupTable}`);
  }

  // ── Step 3: 分批删除（复用同一份 ID 列表）──
  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += batchSize) {
    const chunk = staleIds.slice(i, i + batchSize);
    const [result] = await pool.query(
      `DELETE FROM crm_bid_notice_unspsc_codes WHERE id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
    deleted += (result as ResultSetHeader).affectedRows;
    await sleep(50);
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    `清理完成: 删除 ${deleted} 行，耗时 ${durationMs}ms${backupTable ? `，备份表 ${backupTable}` : ""}`,
  );

  return { bridgeTotal, orphanRows, expiredRows, toDelete, backupTable, deleted, durationMs };
}
