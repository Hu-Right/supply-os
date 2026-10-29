/**
 * 006 · 投标可行性报告数据结构（P0 第一步）
 *
 * @module server/db/migrations/006-feasibility-report
 * @description 只建表、不建数据：要求项（公告侧）、企业证据（资料库最小版）、
 *              企业能力项（结构化档案）、报告（JSON + 版本）。
 *              设计口径见 docs/P0-投标可行性报告/01-数据契约-要求项与能力项.md。
 *              DDL 幂等（CREATE TABLE IF NOT EXISTS），可安全重复执行。
 */
import type { Pool } from "mysql2/promise";

export const migration = {
  version: 6,
  name: "feasibility-report",
  async up(dbPool: Pool): Promise<void> {
    // 公告要求项（LLM/规则抽取结果，带原文锚点与版本）
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS notice_requirement_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        notice_pk BIGINT UNSIGNED NOT NULL COMMENT '公告业务主键，对应 notice_public.notice_pk',
        version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '抽取版本：重抽 +1，历史版本保留',
        seq INT UNSIGNED NOT NULL COMMENT '项序号：同版本内唯一，跨版本稳定复用',
        requirement_type VARCHAR(32) NOT NULL COMMENT 'certification/experience/financial/personnel/localization/registration/technical/commercial/delivery/submission/bond/language/warranty/other',
        importance VARCHAR(16) NOT NULL DEFAULT 'scored' COMMENT 'mandatory=废标项/scored=评分项/preferred=加分项',
        title VARCHAR(255) NOT NULL COMMENT '业务可读标题',
        value_json JSON DEFAULT NULL COMMENT '结构化要求（无法结构化时为空，用 raw_text）',
        raw_text TEXT NOT NULL COMMENT '公告原文片段（供人工复核）',
        source_json JSON NOT NULL COMMENT '证据锚点：kind/ref/locator/quote/capturedAt',
        extraction_method VARCHAR(16) NOT NULL DEFAULT 'llm' COMMENT 'rule/llm/manual',
        confidence DECIMAL(3,2) NOT NULL DEFAULT 0.00 COMMENT '抽取置信度 0~1',
        prompt_version VARCHAR(64) DEFAULT NULL COMMENT '抽取 prompt 版本，便于复现',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_req_notice_version_seq (notice_pk, version, seq),
        KEY idx_req_notice_version (notice_pk, version),
        KEY idx_req_type (requirement_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：公告要求项（结构化+原文锚点）'`,
    );

    // 企业证据（资料库最小版：文件 + 分类/有效期，关联通用 upload_files）
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS enterprise_evidence (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        enterprise_id BIGINT UNSIGNED NOT NULL COMMENT '企业主体（v0.1 = 已认证 supplier.id）',
        upload_file_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联 upload_files 主键（无文件时为 NULL）',
        category VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT 'cert/experience/financial/personnel/other',
        title VARCHAR(255) NOT NULL COMMENT '业务名称（如 ISO 14001 证书）',
        valid_from DATE DEFAULT NULL COMMENT '证据有效期起',
        valid_until DATE DEFAULT NULL COMMENT '证据有效期止（NULL=长期有效，需 no_expiry=1）',
        no_expiry TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=长期有效，与 valid_until 互斥',
        tags_json JSON DEFAULT NULL COMMENT '标签（行业/品类/地区等）',
        confirmed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '用户是否确认过该证据',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_evidence_enterprise (enterprise_id, category),
        KEY idx_evidence_valid_until (valid_until)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：企业证据/资料库最小版'`,
    );

    // 企业能力项（结构化档案：证书/业绩/财务/人员/本地化/注册/技术…）
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS enterprise_capability_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        enterprise_id BIGINT UNSIGNED NOT NULL COMMENT '企业主体（v0.1 = 已认证 supplier.id）',
        capability_type VARCHAR(32) NOT NULL COMMENT 'certification/experience/financial/personnel/localization/registration/technical/text',
        name VARCHAR(255) NOT NULL COMMENT '业务名称',
        value_json JSON NOT NULL COMMENT '结构化能力值（kind + 字段，见数据契约 §3）',
        evidence_refs_json JSON DEFAULT NULL COMMENT 'EvidenceRef 数组',
        confirmation_json JSON DEFAULT NULL COMMENT '来源/确认人/确认时间',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cap_enterprise_type (enterprise_id, capability_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：企业能力项（结构化档案+证据）'`,
    );

    // 报告本体（JSON + 输入快照 + 版本 + 复核）
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS feasibility_reports (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        notice_pk BIGINT UNSIGNED NOT NULL COMMENT '公告业务主键',
        enterprise_id BIGINT UNSIGNED NOT NULL COMMENT '企业主体',
        input_hash CHAR(64) NOT NULL COMMENT '输入快照 hash（公告+要求项版本+能力快照）',
        report_json JSON NOT NULL COMMENT '报告本体（verdict/gaps/matrix/unknowns/aiAdvice）',
        prompt_version VARCHAR(64) NOT NULL COMMENT '生成 prompt 版本',
        model VARCHAR(64) DEFAULT NULL COMMENT '生成所用模型（BYOK）',
        status VARCHAR(16) NOT NULL DEFAULT 'ready' COMMENT 'queued/generating/ready/failed',
        reviewed_by BIGINT UNSIGNED DEFAULT NULL COMMENT '人工复核人 user_id',
        reviewed_at DATETIME DEFAULT NULL COMMENT '人工复核时间',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_report_notice_enterprise_hash (notice_pk, enterprise_id, input_hash),
        KEY idx_report_enterprise (enterprise_id, created_at),
        KEY idx_report_notice (notice_pk)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：报告版本与复核状态'`,
    );
  },
};
