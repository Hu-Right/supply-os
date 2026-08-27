/**
 * 027: 桥接表冗余列清理
 * crm_bid_notice_unspsc_codes: 删除 name 列
 *
 * @module server/db/migrations/027-bridge-column-cleanup
 * @description 删除 name 列（VARCHAR(255)）。
 *              该列在迁移 007 中定义，但从未被写入或读取：
 *              - quality.ts 的 INSERT 语句不包含 name 列
 *              - 搜索/筛选/统计路径均不读取该列
 *              - 580K 行 × 255 字节 = 约 140 MB 无用存储
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "crm_bid_notice_unspsc_codes";

export const migration: Migration = {
  version: 27,
  name: "bridge-column-cleanup",
  async up(dbPool: Pool) {
    // ── Step 0: 确认桥接表存在 ──
    try {
      const [tables] = await dbPool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
        [TABLE],
      );
      if ((tables as any[]).length === 0) {
        console.log("[migration-027] crm_bid_notice_unspsc_codes 不存在，跳过");
        return;
      }
    } catch {
      return;
    }

    // ── Step 1: 删除 name 列 ──
    try {
      const [cols] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM information_schema.columns
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'name'`,
        [TABLE],
      );
      if (Number((cols as RowDataPacket[])[0]?.total || 0) > 0) {
        console.log("[migration-027] 删除 name 列…");
        await dbPool.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`name\``);
        console.log("[migration-027] name 列已删除");
      } else {
        console.log("[migration-027] name 列不存在，跳过");
      }
    } catch (err) {
      console.warn("[migration-027] 删除 name 列失败:", (err as Error).message);
    }

    console.log("[migration-027] 桥接表冗余列清理完成");
  },
};
