/**
 * 024: 桥接表层级 ID 类型统一 + 冗余索引清理
 * crm_bid_notice_unspsc_codes: level1_id~level5_id VARCHAR(32) → INT NULL
 * crm_bid_notices: 删除冗余索引 idx_notices_active_deadline
 * crm_bid_notice_unspsc_codes: 删除冗余索引 idx_code
 *
 * @module server/db/migrations/024-bridge-int-and-index-cleanup
 * @description 三项优化（均为安全变更，不影响业务逻辑）：
 *
 *              1. 公告桥接表 level1_id~level5_id 从 VARCHAR(32) 改为 INT NULL，
 *                 与机会桥接表 crm_bid_opportunity_unspsc_codes 及分类目录表
 *                 crm_unspsc_codes(id INT) 保持类型一致。
 *                 消除隐式类型转换开销，索引更紧凑（INT 4字节 vs VARCHAR(32) 最多33字节）。
 *
 *              2. 删除主表 idx_notices_active_deadline (is_active, deadline_sec)，
 *                 它被 idx_search_composite (is_active, deadline_sec, country, notice_type)
 *                 的最左前缀完全覆盖，属于冗余索引。
 *
 *              3. 删除桥接表 idx_code (code)，
 *                 它被 idx_notice_code_notice (code, notice_id) 的最左前缀完全覆盖，
 *                 属于冗余索引。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 安全删除索引（不存在则跳过） */
async function dropIndexIfExists(
  dbPool: Pool,
  table: string,
  indexName: string,
): Promise<void> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) return;
  await dbPool.query(`DROP INDEX \`${indexName}\` ON \`${table}\``);
}

export const migration: Migration = {
  version: 24,
  name: "bridge-int-and-index-cleanup",
  async up(dbPool: Pool) {
    const TABLE = "crm_bid_notice_unspsc_codes";

    // ── Step 0: 确认桥接表存在 ──
    try {
      const [tables] = await dbPool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
        [TABLE],
      );
      if ((tables as any[]).length === 0) {
        console.log("[migration-024] crm_bid_notice_unspsc_codes 不存在，跳过");
        return;
      }
    } catch {
      return;
    }

    // ── Step 1: level1_id~level5_id VARCHAR(32) NOT NULL → INT NULL ──
    // 原列定义为 VARCHAR(32) NOT NULL DEFAULT ''。
    // MySQL strict mode 下，ALTER TABLE 直接改类型时遇到 '' 会报错。
    // 策略：分三步 ALTER（每步都幂等安全）：
    //   1a. 去掉 NOT NULL 约束（保持 VARCHAR，允许 NULL）
    //   1b. 将空字符串 '' 更新为 NULL
    //   1c. 改类型为 INT NULL DEFAULT NULL
    for (let level = 1; level <= 5; level++) {
      const col = `level${level}_id`;
      try {
        // 检查当前类型
        const [cols] = await dbPool.query(
          `SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND column_name = ?`,
          [TABLE, col],
        );
        const colInfo = (cols as RowDataPacket[])[0];
        if (!colInfo) continue;

        // 已是 INT 类型 → 跳过
        if (colInfo.DATA_TYPE === "int") {
          console.log(`[migration-024] ${col}: 已是 INT，跳过`);
          continue;
        }

        const start = Date.now();
        console.log(`[migration-024] ${col}: ${colInfo.DATA_TYPE} → INT NULL…`);

        // 1a. 去掉 NOT NULL 约束（保持 VARCHAR，允许 NULL）
        if (colInfo.IS_NULLABLE === "NO") {
          await dbPool.query(
            `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${col}\` VARCHAR(32) NULL DEFAULT NULL`,
          );
        }

        // 1b. 将空字符串 '' 更新为 NULL
        await dbPool.query(
          `UPDATE \`${TABLE}\` SET \`${col}\` = NULL WHERE \`${col}\` = ''`,
        );

        // 1c. 改类型为 INT NULL DEFAULT NULL
        await dbPool.query(
          `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${col}\` INT NULL DEFAULT NULL`,
        );

        console.log(`[migration-024] ${col}: 完成 (${Date.now() - start}ms)`);
      } catch (err) {
        console.warn(`[migration-024] ${col} 修改失败:`, (err as Error).message);
      }
    }

    // ── Step 2: 删除冗余索引 idx_notices_active_deadline ──
    // 被 idx_search_composite (is_active, deadline_sec, ...) 最左前缀完全覆盖
    try {
      console.log("[migration-024] 删除冗余索引 idx_notices_active_deadline…");
      await dropIndexIfExists(dbPool, "crm_bid_notices", "idx_notices_active_deadline");
    } catch (err) {
      console.warn("[migration-024] 删除 idx_notices_active_deadline 失败:", (err as Error).message);
    }

    // ── Step 3: 删除冗余索引 idx_code ──
    // 被 idx_notice_code_notice (code, notice_id) 最左前缀完全覆盖
    try {
      console.log("[migration-024] 删除冗余索引 idx_code…");
      await dropIndexIfExists(dbPool, TABLE, "idx_code");
    } catch (err) {
      console.warn("[migration-024] 删除 idx_code 失败:", (err as Error).message);
    }

    console.log("[migration-024] 桥接表类型统一 + 冗余索引清理完成");
  },
};
