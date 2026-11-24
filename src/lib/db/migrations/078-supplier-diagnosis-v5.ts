/**
 * 迁移 078 · 诊断 V5 统一评分影子换表（2026-11-24）
 *
 * @module lib/db/migrations/078-supplier-diagnosis-v5
 * @description V5 把评分统一为 A 资质 30 / B 能力 50 / C 档案 20。
 *              新增 10 列：target_channels / finance_credit / standard_adaptation /
 *              supply_assurance / quality_system / hse_record / service_sla /
 *              warranty_terms / trade_terms / international_visibility。
 *              按项目口径：改已有表 → 影子换表一次到位，旧表归档；不逐列 ALTER。
 *              幂等：归档表存在即跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const CURRENT = "supplier_diagnosis";
const SHADOW = "supplier_diagnosis_v5_shadow";
const ARCHIVE = "z_retired_supplier_diagnosis_v4";

const NEW_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["target_channels", "VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'V5 A2 国际采购渠道（逗号分隔多选）'"],
  ["finance_credit", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 A3 财务与资信'"],
  ["standard_adaptation", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 B1 目标市场标准适配'"],
  ["supply_assurance", "VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'V5 B2 供应链与履约保障（逗号分隔多选）'"],
  ["quality_system", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 B3 质量体系与检验'"],
  ["hse_record", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 B3 HSE 与事故记录'"],
  ["service_sla", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 B4 售后 SLA 与备件'"],
  ["warranty_terms", "VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 B4 质保与性能保证'"],
  ["trade_terms", "VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'V5 B5 贸易条款与结算（逗号分隔多选）'"],
  ["international_visibility", "VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'V5 C3 国际供应商目录可见度（逗号分隔多选）'"],
];

async function tables(pool: Pool): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?)",
    [CURRENT, SHADOW, ARCHIVE],
  );
  return rows.map((r) => String(r.t));
}

async function columnsOf(pool: Pool, table: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
    [table],
  );
  return rows.map((r) => String(r.c));
}

export const migration: Migration = {
  version: 78,
  name: "supplier_diagnosis_v5_unified",
  async up(pool: Pool): Promise<void> {
    const existing = await tables(pool);
    if (existing.includes(ARCHIVE)) return;

    if (!existing.includes(SHADOW)) {
      await pool.query(`CREATE TABLE \`${SHADOW}\` LIKE \`${CURRENT}\``);
      for (const [column, ddl] of NEW_COLUMNS) {
        const cols = await columnsOf(pool, SHADOW);
        if (!cols.includes(column)) {
          await pool.query(`ALTER TABLE \`${SHADOW}\` ADD COLUMN \`${column}\` ${ddl}`);
        }
      }
      // V5 新行默认代次 5；历史行整表复制时保留原值
      await pool.query(
        `ALTER TABLE \`${SHADOW}\` MODIFY COLUMN \`schema_version\` TINYINT UNSIGNED NOT NULL DEFAULT 5 COMMENT '口径代次（5=V5 统一评分；历史代次不互比不重算）'`,
      );
    }

    const shadowCols = await columnsOf(pool, SHADOW);
    const currentCols = await columnsOf(pool, CURRENT);
    const common = shadowCols.filter((c) => currentCols.includes(c));
    const list = common.map((c) => `\`${c}\``).join(", ");
    await pool.query(`INSERT INTO \`${SHADOW}\` (${list}) SELECT ${list} FROM \`${CURRENT}\``);
    await pool.query(`RENAME TABLE \`${CURRENT}\` TO \`${ARCHIVE}\`, \`${SHADOW}\` TO \`${CURRENT}\``);
  },
};
