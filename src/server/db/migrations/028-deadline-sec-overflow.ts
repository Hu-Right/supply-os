/**
 * 028: deadline_sec 生成列溢出修复
 * crm_bid_notices / crm_bid_opportunities: 生成列从 STORED 改为 VIRTUAL + 加 GREATEST 下界保护
 * crm_notice_search 宽表：修复存量溢出值
 *
 * @module server/db/migrations/028-deadline-sec-overflow
 * @description 原生成列公式 `IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)`
 *              当 deadline_ts 为负值时，表达式结果为负数，写入 INT UNSIGNED 列发生溢出回绕
 *              （如 -1 → 4294967295），导致宽表增量同步报 "Out of range value for column 'deadline_sec'"。
 *
 *              修复策略：将生成列从 STORED 改为 VIRTUAL（毫秒级 INSTANT 操作，不锁表），
 *              同时在公式中加入 GREATEST(..., 0) 下界保护，防止负值溢出。
 *
 *              VIRTUAL vs STORED 对比：
 *              - VIRTUAL 不占存储空间，查询时实时计算（公式极轻量，纳秒级）
 *              - 修改 VIRTUAL 列表达式走 INSTANT 算法，仅修改元数据，不重建表
 *              - 索引行为与 STORED 完全一致，搜索性能无差异
 *              - 未来任何公式调整都是毫秒级操作，不会锁表
 *
 *              需要 MySQL 8.0.29+（支持 INSTANT 修改 VIRTUAL 生成列表达式）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 安全修改生成列：STORED → VIRTUAL + 新公式 */
async function migrateDeadlineSec(dbPool: Pool, table: string): Promise<void> {
  const ORIG_FORMULA = "IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)";
  const SAFE_FORMULA = "GREATEST(IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts), 0)";

  try {
    // 检查列是否存在
    const [cols] = await dbPool.query(
      `SELECT EXTRA, GENERATION_EXPRESSION FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'deadline_sec'`,
      [table],
    );
    const colInfo = (cols as any[])[0];
    if (!colInfo) {
      console.log(`[migration-028] ${table}.deadline_sec 不存在，跳过`);
      return;
    }

    const extra = colInfo.EXTRA || "";
    const expr = colInfo.GENERATION_EXPRESSION || "";

    // 已经是 VIRTUAL + 安全公式，无需修改
    if (extra.includes("VIRTUAL") && expr.includes("GREATEST")) {
      console.log(`[migration-028] ${table}.deadline_sec 已是 VIRTUAL + GREATEST，跳过`);
      return;
    }

    // Step 1: STORED → VIRTUAL（保留原公式，INSTANT 操作）
    if (extra.includes("STORED")) {
      console.log(`[migration-028] ${table}.deadline_sec: STORED → VIRTUAL（INSTANT）…`);
      await dbPool.query(
        `ALTER TABLE ${table} MODIFY COLUMN deadline_sec INT UNSIGNED AS (${ORIG_FORMULA}) VIRTUAL`,
      );
    }

    // Step 2: 修改 VIRTUAL 列表达式，加入 GREATEST 下界保护（INSTANT 操作）
    if (!expr.includes("GREATEST")) {
      console.log(`[migration-028] ${table}.deadline_sec: 加入 GREATEST 下界保护（INSTANT）…`);
      await dbPool.query(
        `ALTER TABLE ${table} MODIFY COLUMN deadline_sec INT UNSIGNED AS (${SAFE_FORMULA}) VIRTUAL`,
      );
    }

    console.log(`[migration-028] ${table}.deadline_sec 修复完成`);
  } catch (err) {
    console.warn(`[migration-028] ${table} 修复失败:`, (err as Error).message);
  }
}

export const migration: Migration = {
  version: 28,
  name: "deadline-sec-overflow",
  async up(dbPool: Pool) {
    // ── 修复主表生成列 ──
    await migrateDeadlineSec(dbPool, "crm_bid_notices");
    await migrateDeadlineSec(dbPool, "crm_bid_opportunities");

    // ── 修复宽表存量溢出值 ──
    // INT UNSIGNED 最大值 4294967295；远超正常截止日期的值视为溢出回绕
    try {
      const [tables] = await dbPool.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notice_search'`,
      );
      if ((tables as any[]).length > 0) {
        const [result] = await dbPool.query(
          `UPDATE crm_notice_search SET deadline_sec = 0 WHERE deadline_sec > 4000000000`,
        );
        const affected = (result as any).affectedRows || 0;
        if (affected > 0) {
          console.log(`[migration-028] 修复宽表 ${affected} 条 deadline_sec 溢出记录`);
        }
      }
    } catch (err) {
      console.warn("[migration-028] 宽表存量修复失败:", (err as Error).message);
    }
  },
};
