/**
 * 迁移 077 · 能力画像 V2 影子换表（2026-11-24）
 *
 * @module lib/db/migrations/077-supplier-diagnosis-capability-v2
 * @description 能力画像重规划为 7 维度 15 题，新增 5 列：
 *              technical_differentiation（技术差异化）/ delivery_model（交付模式）/
 *              service_response（售后响应）/ project_control（项目管控）/ market_experience（目标市场经验）。
 *              按项目口径：改已有表 → 影子换表一次到位，旧表归档；不逐列 ALTER。
 *              `LIKE` 复制结构后补列，再按共有列整表复制并 RENAME，幂等（归档表存在即跳过）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const CURRENT = "supplier_diagnosis";
const SHADOW = "supplier_diagnosis_cap_v2_shadow";
const ARCHIVE = "z_retired_supplier_diagnosis_cap_v1";

const NEW_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["technical_differentiation", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '技术差异化（专利/专有工艺/同类案例）'"],
  ["delivery_model", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '交付模式（自营/代理/合资/分包）'"],
  ["service_response", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '售后响应能力（无/SLA/本地备件到场）'"],
  ["project_control", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '项目进度质量风险控制'"],
  ["market_experience", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '目标市场同类客户/项目经验'"],
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
  version: 77,
  name: "supplier_diagnosis_capability_v2",
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
    }

    const shadowCols = await columnsOf(pool, SHADOW);
    const currentCols = await columnsOf(pool, CURRENT);
    const common = shadowCols.filter((c) => currentCols.includes(c));
    const list = common.map((c) => `\`${c}\``).join(", ");
    await pool.query(`INSERT INTO \`${SHADOW}\` (${list}) SELECT ${list} FROM \`${CURRENT}\``);
    await pool.query(`RENAME TABLE \`${CURRENT}\` TO \`${ARCHIVE}\`, \`${SHADOW}\` TO \`${CURRENT}\``);
  },
};
