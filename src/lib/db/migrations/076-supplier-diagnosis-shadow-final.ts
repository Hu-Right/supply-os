/**
 * 迁移 076 · 诊断表 V3 总成影子换表（2026-11-24 用户要求）
 *
 * @module lib/db/migrations/076-supplier-diagnosis-shadow-final
 * @description 之前用 070 / 073 / 074 三次 ALTER 往 `supplier_diagnosis` 上补列，被否：
 *              影子表的意义就是**一次换到位**，不该一条条 ALTER。
 *              本迁移把 V3 全部列一次性并进影子表并换表：
 *              - 以现表 `LIKE` 复制结构（保留历史列与 report_ai，不删列）；
 *              - 补齐 V3 新列（出口资质 / D4 两题 / 6 项资格事实 / 清单勾选状态）；
 *              - 按两侧共有列整表复制，然后 RENAME 换表，旧表归档 `z_retired_supplier_diagnosis_v3pre`。
 *
 *              幂等：归档表已存在则视为已换表，直接返回；影子表已存在则复用。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const CURRENT = "supplier_diagnosis";
const SHADOW = "supplier_diagnosis_v3_shadow_final";
const ARCHIVE = "z_retired_supplier_diagnosis_v3pre";

/** V3 全量新增列（070 / 073 / 074 的内容合并到这里） */
const V3_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["export_entity", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D1 出口主体资质（经营权/海关备案/外汇/退税）'"],
  ["cert_ledger", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D4 资质台账与有效期管理'"],
  ["cert_delivery", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D4 被要求时的取证时效'"],
  ["local_presence", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：本地实体/代理/服务点'"],
  ["similar_projects_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：近三年类似项目份数'"],
  ["largest_contract_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：最大单份合同金额'"],
  ["annual_revenue_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：上一年度营业额'"],
  ["audit_report", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：审计报告与银行资信'"],
  ["local_service_terms", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：本地服务与质保条款'"],
  ["checklist_state", "JSON DEFAULT NULL COMMENT '补齐待办勾选状态'"],
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
  version: 76,
  name: "supplier_diagnosis_shadow_final",
  async up(pool: Pool): Promise<void> {
    const existing = await tables(pool);
    if (existing.includes(ARCHIVE)) return; // 已换过表

    if (!existing.includes(SHADOW)) {
      await pool.query(`CREATE TABLE \`${SHADOW}\` LIKE \`${CURRENT}\``);
      for (const [column, ddl] of V3_COLUMNS) {
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
