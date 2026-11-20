/**
 * 迁移 066 · P1a 方式脊柱：方式判定 / 发布配置 / 平台守护（全量新表，零 ALTER）
 *
 * @module lib/db/migrations/066-procurement-method-spine
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §5
 *
 *              红线（用户 2026-11-20 拍板）：存量表结构变更一律走影子表蓝绿，禁止直接 ALTER。
 *              本迁移因此全部用新表承载：
 *              ① method_decisions        —— F08 方式判定记录（七维输入→推荐→采购方确认→云境复核）
 *              ② procurement_tender_configs —— 发布配置草稿（按 project+version，发布时消费后冻结）
 *              ③ platform_notice_guard   —— 平台公告守护登记（平替 rfq_guard，增 expected_notice_type；
 *                                           rfq_guard 生产 0 行，代码切换后原表留待退役流程，不做 DDL）
 *
 *              P1a 不改 procurement_tenders：sealed/award_method（063 已有列）只做值域扩展，
 *              EOI 写 sealed=0 + award_method='eligibility_filter'。
 *              P1b/P1c 需要给 tenders 加列（qa_deadline_at/envelope_policy/eval_template/
 *              fin_opened_ts/doc_manifest_hash/lta_base_method）时，按影子表蓝绿走。
 *
 *              幂等：建表 IF NOT EXISTS，可重复执行。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const DDL = [
  `CREATE TABLE IF NOT EXISTS \`method_decisions\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本（授权书同口径：版本变更须重新确认）',
    \`inputs\` JSON NOT NULL COMMENT '判定输入快照：七维答案+object_types+预算+品类+purpose',
    \`recommended_method\` VARCHAR(16) NOT NULL COMMENT '引擎推荐 rfq/itb/rfp/eoi/lta',
    \`reason_keys\` JSON NULL COMMENT '命中路径（i18n 键数组，如 method_reason_recurring）',
    \`missing_keys\` JSON NULL COMMENT '应补充的采购信息（i18n 键数组，全案F08三输出之一）',
    \`buyer_method\` VARCHAR(16) NOT NULL COMMENT '采购方最终确认方式（可偏离推荐）',
    \`buyer_note\` VARCHAR(255) DEFAULT NULL COMMENT '偏离推荐的理由（偏离时必填）',
    \`decided_by\` BIGINT UNSIGNED DEFAULT NULL COMMENT '确认人 users.id',
    \`decided_at\` INT UNSIGNED DEFAULT NULL COMMENT '确认时间（秒）',
    \`review_result\` VARCHAR(16) DEFAULT NULL COMMENT '云境复核（feasibility 阶段）：maintained/corrected',
    \`review_method\` VARCHAR(16) DEFAULT NULL COMMENT '复核修正后的方式（corrected 时非空）',
    \`reviewer\` VARCHAR(64) DEFAULT NULL COMMENT '复核人（回调侧运营身份）',
    \`engine_version\` VARCHAR(32) NOT NULL DEFAULT 'rules-v2' COMMENT '规则引擎版本证据（与F04同口径）',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    \`updated_at\` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_method_decision_ver\` (\`project_id\`,\`version_no\`),
    KEY \`idx_method_decision_project\` (\`project_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='F08 采购方式判定记录：规则引擎推荐+采购方确认+云境复核（一次版本一条）'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_tender_configs\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本',
    \`publish_mode\` VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT '发布模式：public/targeted/prequalified',
    \`award_method\` VARCHAR(24) DEFAULT NULL COMMENT '评标法覆盖（空=按方式缺省映射 AWARD_METHOD_BY_METHOD）',
    \`qa_deadline_at\` INT UNSIGNED DEFAULT NULL COMMENT '答疑截止（秒；ITB 专用，须早于响应截止）',
    \`envelope_policy\` VARCHAR(24) NOT NULL DEFAULT 'none' COMMENT '信封策略：none/tech_fin_split（RFP 双信封）',
    \`eval_template\` JSON DEFAULT NULL COMMENT '评分模板快照（维度键/权重/门槛线；发布时冻结；RFP/ITB 必填）',
    \`lta_base_method\` VARCHAR(16) DEFAULT NULL COMMENT 'LTA 绑定的底层竞争方式 rfq/itb/rfp（method=lta 时必填）',
    \`confirmed_by\` BIGINT UNSIGNED DEFAULT NULL COMMENT '采购方内容确认人 users.id（全案F15双审批之采购方侧）',
    \`confirmed_at\` INT UNSIGNED DEFAULT NULL COMMENT '采购方内容确认时间（秒）',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    \`updated_at\` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_tender_config_ver\` (\`project_id\`,\`version_no\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='发布配置草稿：按方式派生缺省，采购方可覆盖；发布时消费并冻结（P1a 零 ALTER 承载方案）'`,

  `CREATE TABLE IF NOT EXISTS \`platform_notice_guard\` (
    \`notice_id\` BIGINT UNSIGNED NOT NULL COMMENT '平台行在 bid_notices.id 的落位（本表主键）',
    \`reference\` VARCHAR(100) NOT NULL COMMENT 'OSPR-{年}-{id} 唯一编号快照，供对账定位',
    \`user_id\` INT DEFAULT NULL COMMENT '创建者 user_id 快照，对账时校验主行归属未被改写',
    \`expected_notice_type\` VARCHAR(16) NOT NULL DEFAULT 'RFQ' COMMENT '预期公告类型码（按发布方式映射：RFQ/ITB/RFP/EOI）',
    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
    PRIMARY KEY (\`notice_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='平台公告守护登记表（平替 rfq_guard）：登记每条平台行预期归属与类型码，对账检出被爬虫改写/消失/类型漂移'`,
];

export const migration: Migration = {
  version: 66,
  name: "066-procurement-method-spine",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of DDL) {
      await dbPool.query(ddl);
    }
  },
};
