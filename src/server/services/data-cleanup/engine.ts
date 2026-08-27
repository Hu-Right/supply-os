/**
 * 通用脏数据清理引擎
 * Stale Data Cleanup Engine
 *
 * @module server/services/data-cleanup/engine
 * @description 提取自 noticeBridgeSync.ts 和 noticeDataCleanup.ts 的通用清理逻辑：
 *              统计 → 备份 → 分批删除 → 日志报告。
 *              具体清理目标通过 CleanupTarget 配置声明。
 */
import "server-only";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

const DEFAULT_BATCH_SIZE = 5000;

/** 单个清理目标的表结构与关联配置 */
export interface CleanupTarget {
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

/** 清理选项 */
export interface CleanupOptions {
  /** 是否同时清理已过期公告（is_expired=1）的附属数据，默认 false */
  includeExpired?: boolean;
  /** 删除批次大小，默认 5000 */
  batchSize?: number;
  /** 删除前是否备份到临时表，默认 true */
  backup?: boolean;
}

/** 清理统计 */
export interface CleanupStats {
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
 * 统计脏数据（只读，不修改任何数据）
 * 供 CLI 脚本 dry-run 模式使用
 */
export async function countStaleData(
  pool: Pool,
  target: CleanupTarget,
  includeExpired = false,
): Promise<{ tableTotal: number; orphanRows: number; expiredRows: number }> {
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
 * 清理脏数据：一次 LEFT JOIN 取 ID + 统计 → 备份 → 分批删除 → 报告。
 * 备份和删除复用已提取的 ID 列表，避免重复全表关联；
 * 分批删除走主键索引，防止大事务锁表。
 *
 * @param pool - 数据库连接池
 * @param target - 清理目标配置
 * @param options - 清理选项
 * @param logger - 日志记录器（可选）
 */
export async function runStaleDataCleanup(
  pool: Pool,
  target: CleanupTarget,
  options: CleanupOptions = {},
  logger?: { info: (msg: string) => void },
): Promise<CleanupStats> {
  const startedAt = Date.now();
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

  logger?.info(
    `扫描完成: ${target.table} ${tableTotal} 行，死数据 ${orphanRows} 行，已过期 ${expiredRows} 行，待删除 ${toDelete} 行`,
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
    logger?.info(`已备份 ${staleIds.length} 行到 ${backupTable}`);
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
  logger?.info(
    `清理完成: 删除 ${deleted} 行，耗时 ${durationMs}ms${backupTable ? `，备份表 ${backupTable}` : ""}`,
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
