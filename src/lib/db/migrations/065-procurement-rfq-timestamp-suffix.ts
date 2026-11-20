/**
 * 迁移 065 · RFQ 闭环时间列后缀纠正（`_at` → `_ts`）
 *
 * @module lib/db/migrations/065-procurement-rfq-timestamp-suffix
 * @description 迁移 063 建表时把「Unix 秒」的时间列写成了 `_at` 后缀，违反全库列名约定
 *              （`_ts`=整数 epoch 秒、`_at`=日期时间），被 `check:db-column-glossary`
 *              门禁拦截（新增列不允许加入存量冻结清单）。
 *
 *              本迁移把这些列原地改名，类型/注释/索引不变（RENAME COLUMN 会自动更新索引）。
 *              幂等：目标列已存在时跳过；源列不存在（如全新库按 baseline 建表）也跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** [表, 旧列, 新列]；全部为新增 RFQ 表/列，不涉及历史冻结列 */
const RENAMES: Array<[table: string, from: string, to: string]> = [
  ["procurement_responses", "submitted_at", "submitted_ts"],
  ["procurement_responses", "withdrawn_at", "withdrawn_ts"],
  ["procurement_responses", "created_at", "created_ts"],
  ["procurement_responses", "updated_at", "updated_ts"],
  ["procurement_response_items", "created_at", "created_ts"],
  ["procurement_response_items", "updated_at", "updated_ts"],
  ["procurement_response_files", "created_at", "created_ts"],
  ["procurement_awards", "approved_at", "approved_ts"],
  ["procurement_awards", "created_at", "created_ts"],
  ["procurement_events", "created_at", "created_ts"],
  ["procurement_tenders", "opened_at", "opened_ts"],
];

export const migration: Migration = {
  version: 65,
  name: "procurement_rfq_timestamp_suffix",
  async up(dbPool: Pool): Promise<void> {
    for (const [table, from, to] of RENAMES) {
      const [rows] = await dbPool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)`,
        [table, from, to],
      );
      const names = new Set(rows.map((row) => String(row.COLUMN_NAME)));
      if (names.has(to)) continue; // 已改名
      if (!names.has(from)) continue; // 表/列不存在（全新库由 baseline 提供终态）
      await dbPool.query(`ALTER TABLE \`${table}\` RENAME COLUMN \`${from}\` TO \`${to}\``);
    }
  },
};
