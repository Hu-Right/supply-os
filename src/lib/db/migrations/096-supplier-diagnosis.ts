/**
 * 096: 供应商投标能力诊断表 v2（旁路新建，旧表 crm_supplier_qualification 完全不动）
 *
 * 设计依据：docs/superpowers/specs/2026-09-24-供应商诊断表统一规范设计.md
 *   - 本表只承载「10 维度 19 题」的能力评估答案；企业基础信息 SSOT 在 supplier 表，
 *     唯一编辑入口是 /settings/enterprise（规范 N2）。
 *   - user_id NOT NULL：写入闸门收敛到登录态（规范 N4），不再有匿名行需要手机号锚点。
 *   - supplier_id NOT NULL + UNIQUE(user_id, supplier_id)：一家公司对一个用户只有一条
 *     现行诊断，重复提交是 UPDATE（规范 N5）。唯一键两列均非空，规避 MySQL「NULL 不去重」。
 *   - score_* 快照 + schema_version：规则演进不使历史报告变味（规范 N8）。
 *   - 提交时点用 submitted_at，不复用 created_at 列名（v1 该列已被 09-23 表重建覆盖，
 *     取证修复另案，见 spec A12）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 96,
  name: "supplier-diagnosis",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_supplier_diagnosis (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

        user_id BIGINT UNSIGNED NOT NULL COMMENT '提交人（登录态写入，不允许为空）',
        supplier_id BIGINT UNSIGNED NOT NULL COMMENT '诊断主体（supplier.id，命中即关联，未命中由服务端建档）',
        company_name VARCHAR(255) NOT NULL COMMENT '主体名称快照（仅用于历史可读，不参与评分与编辑）',

        english_evidence_level VARCHAR(40) NOT NULL COMMENT 'D2 可即时提供的英文投标资料程度',
        english_meeting_capability VARCHAR(40) NOT NULL COMMENT 'D2 英文供应商答疑会与视频澄清会能力',
        tender_experience VARCHAR(40) NOT NULL COMMENT 'D3 近24个月国际公共采购投标实际情况',
        tender_amount_band VARCHAR(40) NOT NULL COMMENT 'D3 最近一次投标金额量级',
        procurement_frameworks VARCHAR(255) NOT NULL COMMENT 'D3 熟悉的采购文件体系（逗号分隔多选）',
        mandatory_docs VARCHAR(500) NOT NULL COMMENT 'D4 可即时提供的强制文件清单（逗号分隔多选）',
        ungm_status VARCHAR(40) NOT NULL COMMENT 'D5 UNGM 注册状态',
        compliance_governance VARCHAR(40) NOT NULL COMMENT 'D5 合规专岗与整改机制',
        technical_response VARCHAR(40) NOT NULL COMMENT 'D6 按标书逐条技术响应与证明能力',
        cost_pricing VARCHAR(40) NOT NULL COMMENT 'D7 报价成本核算方式',
        incoterms_capability VARCHAR(40) NOT NULL COMMENT 'D7 多贸易条款报价能力',
        payment_terms VARCHAR(40) NOT NULL COMMENT 'D7 是否接受30天以上国际账期',
        export_scale VARCHAR(40) NOT NULL COMMENT 'D7 近2年出口与国际业务规模',
        submission_control VARCHAR(40) NOT NULL COMMENT 'D8 标书提交前复核流程',
        deliver_to_site VARCHAR(40) NOT NULL COMMENT 'D9 能否交付至项目现场国',
        service_countries TEXT NOT NULL COMMENT 'D9 有售后点、服务站或维修点的国家清单',
        overseas_companies TEXT NOT NULL COMMENT 'D9 有海外分公司投资公司的国家清单',
        team_discipline VARCHAR(40) NOT NULL COMMENT 'D10 投标团队人数与台账纪律',
        bid_willingness VARCHAR(10) NOT NULL COMMENT '投标意愿（仅线索标记，不参与任何维度计分）',

        audit_status VARCHAR(30) NOT NULL DEFAULT 'pending' COMMENT '人工复核状态: pending/approved/rejected',
        schema_version TINYINT UNSIGNED NOT NULL DEFAULT 2 COMMENT '口径代次（2=本表首代，历史代次不互比不重算）',

        score_total DECIMAL(4,1) NULL COMMENT '评分快照总分（满分100）',
        score_grade VARCHAR(2) NULL COMMENT '评分快照等级 A/B/C',
        score_breakdown JSON NULL COMMENT '10 维度得分明细快照（含依据与人工补充标记）',
        scored_at DATETIME NULL COMMENT '快照生成时间',

        ip VARCHAR(64) NULL COMMENT '提交IP（审计留痕）',
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次提交时间',
        reviewed_at DATETIME NULL COMMENT '人工复核时间',
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE KEY uk_user_supplier (user_id, supplier_id),
        KEY idx_supplier (supplier_id),
        KEY idx_score (score_total),
        KEY idx_submitted (submitted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT='供应商投标能力诊断表 v2（10 维度 19 题，企业基础信息不在本表）'
    `);
  },
};
