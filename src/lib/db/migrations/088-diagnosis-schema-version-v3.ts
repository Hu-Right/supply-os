/**
 * 迁移 088 · 诊断口径代次归名 V3（2026-11-28）
 *
 * @module lib/db/migrations/088-diagnosis-schema-version-v3
 * @description 用户定调：现行诊断口径本质是 V3 的延续迭代，"V5" 编号虚高，统一定名 V3。
 *              本迁移只对齐列默认值与列注释：
 *              - schema_version 默认值 5 → 3，注释改为「3=V3 统一评分」
 *              - 078 写入的 10 个作答列注释（V5 A2…C3）→ V3
 *              - 084 写入的 overseas_record / record_evidence 列注释里的「V5 C4-x」→「V3 C4-x」
 *              - checklist_state 列注释去掉「非 V5 作答字段」的旧提法
 *              存量行的 schema_version=5 → 3 与 score_breakdown.ruleVersion=5 → 3
 *              由一次性数据归一 SQL 执行（不放进迁移：迁移链重放到老库时行集不同）。
 *              新写入由门户代码 DIAGNOSIS_SCHEMA_VERSION=3 控制，不依赖列默认值。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const COMMENT_ONLY_ALTERS: ReadonlyArray<readonly [string, string]> = [
  ["target_channels", "varchar(255) NOT NULL DEFAULT '' COMMENT 'V3 A2 国际采购渠道（逗号分隔多选）'"],
  ["finance_credit", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 A3 财务与资信'"],
  ["standard_adaptation", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 B1 目标市场标准适配'"],
  ["supply_assurance", "varchar(255) NOT NULL DEFAULT '' COMMENT 'V3 B2 供应链与履约保障（逗号分隔多选）'"],
  ["quality_system", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 B3 质量体系与检验'"],
  ["hse_record", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 B3 HSE 与事故记录'"],
  ["service_sla", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 B4 售后 SLA 与备件'"],
  ["warranty_terms", "varchar(80) NOT NULL DEFAULT '' COMMENT 'V3 B4 质保与性能保证'"],
  ["trade_terms", "varchar(255) NOT NULL DEFAULT '' COMMENT 'V3 B5 贸易条款与结算（逗号分隔多选）'"],
  ["international_visibility", "varchar(255) NOT NULL DEFAULT '' COMMENT 'V3 C3 国际供应商目录可见度（逗号分隔多选）'"],
  ["checklist_state", "json DEFAULT NULL COMMENT 'V3 执行清单勾选状态（非作答字段，后台报告清单读写需要）'"],
];

export const migration: Migration = {
  version: 88,
  name: "diagnosis_schema_version_v3",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "ALTER TABLE supplier_diagnosis MODIFY COLUMN schema_version TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '口径代次（3=V3 统一评分；历史代次不互比不重算）'",
    );
    await dbPool.query(
      "ALTER TABLE supplier_diagnosis MODIFY COLUMN overseas_record VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V3 C4-1 海外同类项目业绩（无/仅国内/有海外）'",
    );
    await dbPool.query(
      "ALTER TABLE supplier_diagnosis MODIFY COLUMN record_evidence VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V3 C4-2 可提供证明（无/仅合同/合同+验收/+业主可回访）'",
    );
    for (const [column, ddl] of COMMENT_ONLY_ALTERS) {
      await dbPool.query(`ALTER TABLE supplier_diagnosis MODIFY COLUMN ${column} ${ddl}`);
    }
  },
};
