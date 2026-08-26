/**
 * 013: 宽表 description 列类型优化
 * crm_notice_search description columns: LONGTEXT → TEXT
 *
 * @module server/db/migrations/013-wide-table-varchar
 * @description 将宽表的 7 个 description LONGTEXT 列改为 TEXT，
 *              消除 InnoDB 溢出页（overflow pages）存储，使数据全部存储在行内。
 *              列表展示只需前 300-500 字符，Meilisearch 索引同步也只取前 2000 字符，
 *              无需存储完整原文。
 *              使用 TEXT 而非 VARCHAR(2000)，因宽表列数多，VARCHAR 会超出 MySQL 行大小限制 65535 字节。
 *              预期效果：Phase 2 查询从 7s+ 降至 <100ms。
 *
 *              执行流程：
 *              1. 分批截断超长数据（每批 5000 行，避免长事务锁表）
 *              2. 逐列 ALTER（每列一次全表重建，共 7 次）
 *              3. 幂等安全：已完成的列自动跳过
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const MAX_LEN = 2000;
const BATCH_SIZE = 5000;

export const migration: Migration = {
  version: 13,
  name: "wide-table-varchar",
  async up(dbPool: Pool) {
    // 检查表是否存在
    try {
      const [tables] = await dbPool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_notice_search'"
      );
      if ((tables as any[]).length === 0) {
        console.log("[migration-013] crm_notice_search 不存在，跳过");
        return;
      }
    } catch {
      return;
    }

    const columns = [
      "description", "description_zh", "description_en",
      "description_fr", "description_ru", "description_es", "description_ar",
    ];

    // ── Step 1: 分批截断超长数据（避免 ALTER 时 "Data too long" 错误）──
    console.log("[migration-013] Step 1: 分批截断超长数据…");
    for (const col of columns) {
      try {
        let totalTruncated = 0;
        while (true) {
          const [result] = await dbPool.query(
            `UPDATE crm_notice_search SET ${col} = LEFT(${col}, ?) WHERE CHAR_LENGTH(${col}) > ? LIMIT ?`,
            [MAX_LEN, MAX_LEN, BATCH_SIZE]
          );
          const affected = (result as any).affectedRows || 0;
          totalTruncated += affected;
          if (affected < BATCH_SIZE) break;
        }
        if (totalTruncated > 0) {
          console.log(`[migration-013]   ${col}: 截断 ${totalTruncated} 行`);
        }
      } catch (err) {
        console.warn(`[migration-013]   ${col} 截断失败:`, (err as Error).message);
      }
    }

    // ── Step 2: 逐列 ALTER（每列一次全表重建）──
    console.log("[migration-013] Step 2: 逐列修改类型…");
    for (const col of columns) {
      try {
        // 检查当前类型
        const [cols] = await dbPool.query(
          `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
           FROM information_schema.columns 
           WHERE table_schema = DATABASE() 
             AND table_name = 'crm_notice_search' 
             AND column_name = ?`,
          [col]
        );
        const colInfo = (cols as any[])[0];
        if (!colInfo) continue;

        // 已经是 TEXT 则跳过
        if (colInfo.DATA_TYPE === "text") {
          console.log(`[migration-013]   ${col}: 已是 TEXT，跳过`);
          continue;
        }

        console.log(`[migration-013]   ${col}: ${colInfo.DATA_TYPE} → TEXT…`);
        const start = Date.now();
        await dbPool.query(
          `ALTER TABLE crm_notice_search MODIFY COLUMN ${col} TEXT NOT NULL`
        );
        console.log(`[migration-013]   ${col}: 完成 (${Date.now() - start}ms)`);
      } catch (err) {
        console.warn(`[migration-013]   ${col} 修改失败:`, (err as Error).message);
      }
    }

    console.log("[migration-013] 宽表 description 列优化完成");
  },
};
