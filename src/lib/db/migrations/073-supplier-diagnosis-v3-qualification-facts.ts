/**
 * 迁移 073 · 诊断 v3 资格事实字段（2026-11-24 用户拍板）
 *
 * @module lib/db/migrations/073-supplier-diagnosis-v3-qualification-facts
 * @description 报告主线从"能力评分"改成"资质结论"后，问卷必须提供**可举证的资格事实**，
 *              而原来 20 题里 14 题只服务于 100 分能力分（语言、报价精细度、提交复核、团队台账…），
 *              对能否进场没有信息量。v3 把问卷拆成：
 *              - 资格必答（迁移本表新增 6 项 + 目标市场 + 出口主体资质）：决定准入判断；
 *              - 能力画像（原 D2–D10，选答）：只决定 100 分能力等级，不答则标"未评估"。
 *
 *              新增列全部 NOT NULL DEFAULT ''，历史行不受影响（代次仍为 3，不重算）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "supplier_diagnosis";

const COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["local_presence", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：目标市场的本地实体/代理/服务点'"],
  ["similar_projects_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：近三年类似项目份数'"],
  ["largest_contract_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：最大单份合同金额段'"],
  ["annual_revenue_band", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：年营业额段'"],
  ["audit_report", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：审计报告与银行资信'"],
  ["local_service_terms", "VARCHAR(40) NOT NULL DEFAULT '' COMMENT '资格事实：是否接受本地服务与质保条款'"],
];

export const migration: Migration = {
  version: 73,
  name: "supplier_diagnosis_v3_qualification_facts",
  async up(dbPool: Pool): Promise<void> {
    for (const [column, ddl] of COLUMNS) {
      const [rows] = await dbPool.query(
        "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [TABLE, column],
      );
      const exists = Number((rows as { n?: number }[])[0]?.n ?? 0) > 0;
      if (!exists) await dbPool.query(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${column}\` ${ddl}`);
    }
  },
};
