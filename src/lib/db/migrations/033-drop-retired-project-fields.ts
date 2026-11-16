/**
 * 迁移 033 · 清理 F02 已下线字段
 *
 * @module server/db/migrations/033-drop-retired-project-fields
 * @description 以下字段已从界面与读写契约移除，库列保留只会造成“代码不读、库还在”的分叉：
 *              - procurement_projects.standards（标准文本，已被认证要求替代）
 *              - procurement_projects.budget_approved（预算批准状态，已删除）
 *              - procurement_projects.supplier_country_limit（供应商国别限制，已删除）
 *              - procurement_projects.manufacturer_only（已由 supplier_type 三选一替代）
 *              - procurement_items.qty_type（确定/预估数量，已删除）
 *              历史 revision 快照是 JSON，不受删列影响。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DROPS: Array<[string, string]> = [
  ["procurement_projects", "standards"],
  ["procurement_projects", "budget_approved"],
  ["procurement_projects", "supplier_country_limit"],
  ["procurement_projects", "manufacturer_only"],
  ["procurement_items", "qty_type"],
];

export const migration: Migration = {
  version: 33,
  name: "drop_retired_project_fields",
  async up(dbPool: Pool): Promise<void> {
    for (const [table, column] of DROPS) {
      const [rows] = await dbPool.query(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
        [table, column],
      );
      if ((rows as RowDataPacket[]).length === 0) continue;
      await dbPool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  },
};
