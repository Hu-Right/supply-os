/**
 * 公告附属数据脏数据清理服务（翻译表 + 搜索宽表）
 * Notice dependent-data stale cleanup service (translations + wide table)
 *
 * @module server/services/noticeDataCleanup
 * @description 比对 crm_bid_notices（主表）与两个附属数据源，清理"主表已不存在
 *              （或已失效）"的记录，与桥接表清理（noticeBridgeSync.ts）模式一致：
 *              统计 → 备份 → 分批删除 → 日志报告，供一次性清理脚本
 *              （scripts/cleanup-notice-data.ts）与后台定时任务
 *              （server/lifecycle/timers.ts）复用。
 *
 *              关联口径（已按 INFORMATION_SCHEMA 实际结构核实）：
 *              - crm_notice_translations.notice_id（BIGINT）→ crm_bid_notices.id
 *              - crm_notice_search.notice_id（VARCHAR）→ crm_bid_notices.notice_id（外部编号）
 *
 *              过期口径与桥接表一致：主表 is_expired = 1 视为已失效；
 *              默认仅清理"主表完全不存在"的硬死数据，过期数据通过
 *              includeExpired 显式开启（公告未来若被同步任务回填时仍可恢复，
 *              保守默认不删）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createLogger } from "../utils/fileLogger";

const logger = createLogger("data-cleanup");

const DEFAULT_BATCH_SIZE = 5000;

export type CleanupTargetKey = "translations" | "wide";

/** 单个清理目标的表结构与关联配置 */
interface CleanupTarget {
  /** 目标表名 */
  table: string;
  /** 目标表主键列（分批删除按主键 IN） */
  idColumn: string;
  /** 目标表关联列 */
  joinColumn: string;
  /** 主表被关联的列 */
  mainJoinColumn: string;
  /** 备份表名前缀（自动拼 _YYYYMMDD 后缀） */
  backupPrefix: string;
}

export const CLEANUP_TARGETS: Record<CleanupTargetKey, CleanupTarget> = {
  // 翻译表 notice_id 是 BIGINT，存的是主表自增 id
  translations: {
    table: "crm_notice_translations",
    idColumn: "id",
    joinColumn: "notice_id",
    mainJoinColumn: "id",
    backupPrefix: "crm_notice_translations_backup",
  },
  // 宽表 notice_id 是外部公告编号（与主表 notice_id 同源，与桥接表一致）
  wide: {
    table: "crm_notice_search",
    idColumn: "id",
    joinColumn: "notice_id",
    mainJoinColumn: "notice_id",
    backupPrefix: "crm_notice_search_backup",
  },
};

export interface NoticeDataCleanupOptions {
  /** 是否同时清理已过期公告（is_expired=1）的附属数据，默认 false */
  includeExpired?: boolean;
  /** 删除批次大小，默认 5000 */
  batchSize?: number;
  /** 删除前是否备份到临时表，默认 true */
  backup?: boolean;
}

export interface NoticeDataCleanupStats {
  /** 目标表名 */
  table: string;
  /** 清理前目标表总行数 */
  tableTotal: number;
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

/** 生成当日备份表名：{backupPrefix}_YYYYMMDD */
function backupTableName(prefix: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统计附属数据源脏数据（只读，不修改任何数据）
 * 供 CLI 脚本 dry-run 模式使用
 */
export async function countStaleNoticeData(
  pool: Pool,
  targetKey: CleanupTargetKey,
  includeExpired = false,
): Promise<{ tableTotal: number; orphanRows: number; expiredRows: number }> {
  const target = CLEANUP_TARGETS[targetKey];
  const [totalRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM ${target.table}`);
  const tableTotal = Number((totalRows as RowDataPacket[])[0].cnt);

  const [staleRows] = await pool.query(
    `SELECT
       SUM(n.id IS NULL) AS orphan_rows,
       SUM(n.id IS NOT NULL AND n.is_expired = 1) AS expired_rows
     FROM ${target.table} t
     LEFT JOIN crm_bid_notices n ON n.${target.mainJoinColumn} = t.${target.joinColumn}`,
  );
  const row = (staleRows as RowDataPacket[])[0];
  return {
    tableTotal,
    orphanRows: Number(row.orphan_rows || 0),
    expiredRows: Number(row.expired_rows || 0),
  };
}

/**
 * 清理附属数据源脏数据：一次 LEFT JOIN 取 ID + 统计 → 备份 → 分批删除 → 报告。
 * 与 cleanupStaleNoticeBridge 同一模式：备份和删除复用已提取的 ID 列表，
 * 避免重复全表关联；分批删除走主键索引，防止大事务锁表。
 */
export async function cleanupStaleNoticeData(
  pool: Pool,
  targetKey: CleanupTargetKey,
  options: NoticeDataCleanupOptions = {},
): Promise<NoticeDataCleanupStats> {
  const startedAt = Date.now();
  const target = CLEANUP_TARGETS[targetKey];
  const batchSize = Math.max(1, Math.floor(Number(options.batchSize || DEFAULT_BATCH_SIZE)));
  const includeExpired = Boolean(options.includeExpired);
  const withBackup = options.backup !== false;

  // ── Step 1: 一次查询获取目标表总数 + 待删行 ID + 统计值 ──
  const [totalRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM ${target.table}`);
  const tableTotal = Number((totalRows as RowDataPacket[])[0].cnt);

  const where = buildStaleWhere(includeExpired);
  const [staleRows] = await pool.query(
    `SELECT t.${target.idColumn} AS target_id,
            SUM(n.id IS NULL) OVER() AS orphan_rows,
            SUM(n.id IS NOT NULL AND n.is_expired = 1) OVER() AS expired_rows
     FROM ${target.table} t
     LEFT JOIN crm_bid_notices n ON n.${target.mainJoinColumn} = t.${target.joinColumn}
     WHERE ${where}`,
  );
  const staleData = staleRows as RowDataPacket[];
  const orphanRows = staleData.length > 0 ? Number(staleData[0].orphan_rows || 0) : 0;
  const expiredRows = staleData.length > 0 ? Number(staleData[0].expired_rows || 0) : 0;
  const toDelete = orphanRows + (includeExpired ? expiredRows : 0);
  const staleIds = staleData.map((r) => Number(r.target_id));

  logger.info(
    `[${targetKey}] 扫描完成: ${target.table} ${tableTotal} 行，死数据 ${orphanRows} 行，已过期 ${expiredRows} 行，待删除 ${toDelete} 行`,
  );

  // ── Step 2: 备份（复用已提取的 ID，走主键索引而非 LEFT JOIN）──
  let backupTable: string | null = null;
  if (staleIds.length > 0 && withBackup) {
    backupTable = backupTableName(target.backupPrefix);
    const [exists] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [backupTable],
    );
    const existsCount = Number((exists as RowDataPacket[])[0].cnt);
    const ph = staleIds.map(() => "?").join(",");
    if (existsCount > 0) {
      await pool.query(
        `INSERT INTO ${backupTable} SELECT * FROM ${target.table} WHERE ${target.idColumn} IN (${ph})`,
        staleIds,
      );
    } else {
      await pool.query(
        `CREATE TABLE ${backupTable} AS SELECT * FROM ${target.table} WHERE ${target.idColumn} IN (${ph})`,
        staleIds,
      );
    }
    logger.info(`[${targetKey}] 已备份 ${staleIds.length} 行到 ${backupTable}`);
  }

  // ── Step 3: 分批删除（复用同一份 ID 列表）──
  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += batchSize) {
    const chunk = staleIds.slice(i, i + batchSize);
    const [result] = await pool.query(
      `DELETE FROM ${target.table} WHERE ${target.idColumn} IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
    deleted += (result as ResultSetHeader).affectedRows;
    await sleep(50);
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    `[${targetKey}] 清理完成: 删除 ${deleted} 行，耗时 ${durationMs}ms${backupTable ? `，备份表 ${backupTable}` : ""}`,
  );

  return {
    table: target.table,
    tableTotal,
    orphanRows,
    expiredRows,
    toDelete,
    backupTable,
    deleted,
    durationMs,
  };
}
