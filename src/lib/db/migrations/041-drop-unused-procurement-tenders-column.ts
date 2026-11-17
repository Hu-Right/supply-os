/**
 * 迁移 041 — 摘除 procurement_tenders 的未使用字段
 *
 * @module server/db/migrations/041-drop-unused-procurement-tenders-column
 * @description 2026-11-17 字段审计（门户 + 后台双仓扫描，排除 migrations）：
 *              `procurement_tenders.document_manifest`（公开文件清单，JSON）在
 *              门户与后台代码中**零引用**，且当前 1 行数据该列全为 NULL，
 *              故随本次审计一并摘除。原值已备份到
 *              `zz_bak_procurement_tenders_unused_20261117`。
 *
 *              说明：reco_supplier_opportunity 里同为未引用的
 *              best_supplier_conf / code_hit_l5 / match_path_text / pushed_at / tenant_id
 *              属后台推荐域，已由后台侧直接 ALTER 摘除并备份
 *              （`zz_bak_reco_supplier_opportunity_unused_20261117`），不在本迁移内。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "procurement_tenders";
const COLUMN = "document_manifest";

async function hasColumn(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

export const migration: Migration = {
  version: 41,
  name: "drop_unused_procurement_tenders_column",
  async up(dbPool: Pool): Promise<void> {
    if (!(await hasColumn(dbPool, TABLE, COLUMN))) return;
    await dbPool.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${COLUMN}\``);
    console.log(`[migration 041] 已摘除 ${TABLE}.${COLUMN}`);
  },
};
