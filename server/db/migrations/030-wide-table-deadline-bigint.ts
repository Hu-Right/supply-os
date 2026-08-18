/**
 * 030: 宽表 deadline_sec 扩容 INT → BIGINT + 修复溢出归零数据
 *
 * @module server/db/migrations/030-wide-table-deadline-bigint
 * @description 028 迁移将宽表 deadline_sec > 4,000,000,000 的记录归零为 0（"永不过期"），
 *              但 INT UNSIGNED 最大值 4,294,967,295 ≈ 2106 年，导致 2106 年之后的合法远期
 *              截止日期被错误归零，前端搜索计数虚高约 11,000 条。
 *
 *              修复策略：
 *              1. 将宽表 deadline_sec 从 INT UNSIGNED 扩容为 BIGINT UNSIGNED（INSTANT DDL，
 *                 MySQL 8.0.12+ 整数扩展仅修改元数据，不重建表、不锁表）
 *              2. 从主表 crm_bid_notices 回填被错误归零的记录
 *              3. 后续增量同步 / 对账自动恢复正常值
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 30,
  name: "wide-table-deadline-bigint",
  async up(dbPool: Pool) {
    // ── Step 1: 检查宽表是否存在 ──
    const [tables] = await dbPool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notice_search'`,
    );
    if ((tables as any[]).length === 0) {
      console.log("[migration-030] crm_notice_search 不存在，跳过");
      return;
    }

    // ── Step 2: 扩容列类型 INT UNSIGNED → BIGINT UNSIGNED ──
    // MySQL 8.0.12+ 整数扩展是 INSTANT DDL（毫秒级，不锁表）
    try {
      const [cols] = await dbPool.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notice_search' AND COLUMN_NAME = 'deadline_sec'`,
      );
      const currentType = (cols as any[])[0]?.DATA_TYPE || "";
      if (currentType === "bigint") {
        console.log("[migration-030] deadline_sec 已是 BIGINT，跳过 DDL");
      } else {
        console.log(`[migration-030] deadline_sec: ${currentType} → BIGINT UNSIGNED（INSTANT DDL）…`);
        await dbPool.query(
          `ALTER TABLE crm_notice_search MODIFY COLUMN deadline_sec BIGINT UNSIGNED NOT NULL DEFAULT 0`,
        );
        console.log("[migration-030] DDL 完成");
      }
    } catch (err) {
      console.warn("[migration-030] DDL 失败:", (err as Error).message);
      return;
    }

    // ── Step 3: 修复被 028 迁移错误归零的记录 ──
    // 条件：宽表 deadline_sec = 0，但主表 deadline_sec > 0（有合法截止日期）
    try {
      const [before] = await dbPool.query(
        `SELECT COUNT(*) as cnt FROM crm_notice_search ns
         INNER JOIN crm_bid_notices n ON n.id = ns.id
         WHERE ns.deadline_sec = 0 AND n.deadline_sec > 0`,
      );
      const toFix = Number((before as any[])[0]?.cnt || 0);

      if (toFix > 0) {
        console.log(`[migration-030] 发现 ${toFix} 条被错误归零的记录，开始回填…`);
        // 分批更新，每批 5000，避免长事务锁
        let totalFixed = 0;
        while (true) {
          const [result] = await dbPool.query(
            `UPDATE crm_notice_search ns
             INNER JOIN crm_bid_notices n ON n.id = ns.id
             SET ns.deadline_sec = n.deadline_sec
             WHERE ns.deadline_sec = 0 AND n.deadline_sec > 0
             LIMIT 5000`,
          );
          const affected = (result as any).affectedRows || 0;
          totalFixed += affected;
          if (affected < 5000) break;
        }
        console.log(`[migration-030] 回填完成: ${totalFixed} 条`);
      } else {
        console.log("[migration-030] 无需修复的记录");
      }
    } catch (err) {
      console.warn("[migration-030] 数据回填失败:", (err as Error).message);
    }
  },
};
