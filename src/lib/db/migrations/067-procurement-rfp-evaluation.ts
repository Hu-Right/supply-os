/**
 * 迁移 067 · P1b RFP：评审打分表 + 信封开封记录（全量新表，零 ALTER）
 *
 * @module lib/db/migrations/067-procurement-rfp-evaluation
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §5.3/§7.3
 *
 *              红线（用户拍板）：存量表结构变更一律影子表，禁止直接 ALTER —— 本次继续零 ALTER：
 *              ① procurement_evaluations   —— F18 评审打分（维度×权重快照；RFP/ITB 共用；
 *                                            stage=qualification/technical/financial，
 *                                            多评委 RBAC 留 evaluator 列，P1b 采购方单人=NULL）
 *              ② procurement_envelope_openings —— RFP 双信封开封时序记录（技术封在收标开封时
 *                                            由 opening 批量写入；商务封须技术达标后由
 *                                            openFinancialEnvelope 写入；uk=(response, envelope)）
 *
 *              RFP 评分模板冻结值已存 procurement_tender_configs.eval_template（066），
 *              评分行冗余 weight 快照防模板漂移。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const DDL = [
  `CREATE TABLE IF NOT EXISTS \`procurement_evaluations\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本',
    \`tender_id\` INT UNSIGNED NOT NULL COMMENT '标讯 procurement_tenders.id',
    \`response_id\` BIGINT UNSIGNED NOT NULL COMMENT 'procurement_responses.id',
    \`stage\` VARCHAR(16) NOT NULL COMMENT '评审阶段：qualification/technical/financial（推导自 method+award_method）',
    \`dimension_key\` VARCHAR(64) NOT NULL COMMENT '维度键（eval_template 快照内的键）',
    \`score\` DECIMAL(6,2) DEFAULT NULL COMMENT '得分（评分型判项，0~维度权重）',
    \`pass_fail\` VARCHAR(8) DEFAULT NULL COMMENT 'pass/fail（合格型判项）',
    \`weight\` DECIMAL(6,2) DEFAULT NULL COMMENT '维度权重快照（冗余自 eval_template，防漂移）',
    \`evaluator\` BIGINT UNSIGNED DEFAULT NULL COMMENT '评委 users.id；NULL=采购方单人（P1b 口径）',
    \`note\` VARCHAR(500) DEFAULT NULL COMMENT '打分依据/偏离说明',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    \`updated_at\` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_evaluation_dim\` (\`response_id\`, \`stage\`, \`dimension_key\`, \`evaluator\`),
    KEY \`idx_evaluation_project\` (\`project_id\`, \`version_no\`),
    KEY \`idx_evaluation_tender\` (\`tender_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='F18 评审打分：维度×权重发布前冻结；合格型与评分型判项并存；多评委 RBAC 留 evaluator 列'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_envelope_openings\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`tender_id\` INT UNSIGNED NOT NULL COMMENT '标讯 procurement_tenders.id',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`response_id\` BIGINT UNSIGNED NOT NULL COMMENT 'procurement_responses.id',
    \`envelope\` VARCHAR(16) NOT NULL COMMENT '开封的信封：technical/financial',
    \`opened_at\` INT UNSIGNED NOT NULL COMMENT '开封时间（秒）',
    \`opened_by\` BIGINT UNSIGNED DEFAULT NULL COMMENT '开封人 users.id；technical 批量开封时为 NULL（系统）',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_envelope_opening\` (\`response_id\`, \`envelope\`),
    KEY \`idx_envelope_opening_tender\` (\`tender_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='RFP 双信封开封时序：技术封随收标开封；商务封须技术达标后开封（防先看价再打技术分）'`,
];

export const migration: Migration = {
  version: 67,
  name: "067-procurement-rfp-evaluation",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of DDL) {
      await dbPool.query(ddl);
    }
  },
};
