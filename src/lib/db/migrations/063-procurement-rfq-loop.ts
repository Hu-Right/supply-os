/**
 * 迁移 063 · 采购需求 P0：RFQ 闭环（响应 / 密封 / 开标 / 定标）
 *
 * @module lib/db/migrations/063-procurement-rfq-loop
 * @description 设计稿：docs/2026-11-20-采购需求P0-RFQ闭环-设计与DDL.md
 *
 *              背景：发布链（011/012/014）已能把需求投影成平台公告，但发布之后是断的——
 *              供应商无任何写入口，`procurement_matches`/`procurement_invitations` 已在 034
 *              删除，`procurement_mode` 也在 026 被当作「恒为 rfq 的预留列」删掉。本次把
 *              「方式」重新引入为有真实语义的列，并补齐响应、定标、审计三组表。
 *
 *              幂等：加列/索引先查 information_schema；建表用 IF NOT EXISTS。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

const DDL = [
  `CREATE TABLE IF NOT EXISTS \`procurement_responses\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本',
    \`tender_id\` INT UNSIGNED NOT NULL COMMENT '标讯 procurement_tenders.id',
    \`supplier_id\` INT UNSIGNED NOT NULL COMMENT '供应商 supplier.id',
    \`user_id\` BIGINT UNSIGNED NOT NULL COMMENT '提交账号 users.id',
    \`method\` VARCHAR(16) NOT NULL DEFAULT 'rfq' COMMENT '方式快照',
    \`status\` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/submitted/withdrawn/disqualified/evaluated',
    \`currency\` VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '报价币种（整单一种）',
    \`incoterm\` VARCHAR(20) DEFAULT NULL COMMENT '贸易术语（覆盖项目级）',
    \`incoterm_place\` VARCHAR(120) DEFAULT NULL COMMENT '贸易术语地点',
    \`validity_days\` SMALLINT UNSIGNED DEFAULT NULL COMMENT '报价有效期（天）',
    \`lead_time_days\` SMALLINT UNSIGNED DEFAULT NULL COMMENT '整单交期（天）',
    \`tax_included\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '报价是否含税',
    \`remark\` VARCHAR(1000) DEFAULT NULL COMMENT '供应商备注/偏差说明',
    \`receipt_no\` VARCHAR(32) DEFAULT NULL COMMENT '回执编号 OSRP-{年}-{6位id}',
    \`receipt_hash\` CHAR(64) DEFAULT NULL COMMENT '回执哈希 sha256',
    \`sealed_until\` INT UNSIGNED NOT NULL COMMENT '密封截止=标讯 deadline_at',
    \`submitted_at\` INT UNSIGNED DEFAULT NULL COMMENT '提交时间（秒）',
    \`withdrawn_at\` INT UNSIGNED DEFAULT NULL COMMENT '撤回时间（秒）',
    \`client_ip\` VARCHAR(64) DEFAULT NULL COMMENT '提交 IP',
    \`user_agent\` VARCHAR(500) DEFAULT NULL COMMENT 'User-Agent',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    \`updated_at\` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_resp_project_supplier_ver\` (\`project_id\`,\`version_no\`,\`supplier_id\`),
    UNIQUE KEY \`uq_resp_receipt_no\` (\`receipt_no\`),
    KEY \`idx_resp_project\` (\`project_id\`,\`version_no\`,\`status\`),
    KEY \`idx_resp_supplier\` (\`supplier_id\`,\`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='RFQ 响应（一家一版一条；撤回后可重新提交同一行）'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_response_items\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`response_id\` BIGINT UNSIGNED NOT NULL COMMENT 'procurement_responses.id',
    \`item_id\` INT UNSIGNED DEFAULT NULL COMMENT 'procurement_items.id；标包级报价为空',
    \`lot_id\` INT UNSIGNED DEFAULT NULL COMMENT 'procurement_lots.id',
    \`seq\` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '行序',
    \`unit_price\` DECIMAL(20,4) DEFAULT NULL COMMENT '单价',
    \`quantity\` DECIMAL(20,4) DEFAULT NULL COMMENT '报价数量',
    \`uom\` VARCHAR(20) DEFAULT NULL COMMENT '单位',
    \`lead_time_days\` SMALLINT UNSIGNED DEFAULT NULL COMMENT '本行交期（天）',
    \`moq\` DECIMAL(20,4) DEFAULT NULL COMMENT '最小起订量',
    \`brand_model\` VARCHAR(200) DEFAULT NULL COMMENT '品牌/型号',
    \`compliance\` JSON DEFAULT NULL COMMENT '强制标准符合性与偏差说明',
    \`remark\` VARCHAR(500) DEFAULT NULL COMMENT '行备注',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    \`updated_at\` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）',
    PRIMARY KEY (\`id\`),
    KEY \`idx_respitem_response\` (\`response_id\`,\`seq\`),
    KEY \`idx_respitem_item\` (\`item_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='RFQ 逐项报价（总价由服务端聚合，不落库避免漂移）'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_response_files\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`response_id\` BIGINT UNSIGNED NOT NULL COMMENT 'procurement_responses.id',
    \`envelope\` VARCHAR(16) NOT NULL DEFAULT 'technical' COMMENT 'technical/financial/commercial',
    \`doc_kind\` VARCHAR(32) NOT NULL DEFAULT 'attachment' COMMENT '文件类别',
    \`file_key\` VARCHAR(255) NOT NULL COMMENT 'upload_files 文件名',
    \`file_name\` VARCHAR(255) NOT NULL COMMENT '原始文件名',
    \`file_hash\` CHAR(64) NOT NULL COMMENT 'sha256',
    \`file_size\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '字节数',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '上传时间（秒）',
    PRIMARY KEY (\`id\`),
    KEY \`idx_respfile_response\` (\`response_id\`,\`envelope\`),
    KEY \`idx_respfile_key\` (\`file_key\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='响应附件（技术/商务分信封，为 P1 密封评审预留）'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_awards\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT 'procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL COMMENT '定标对应需求版本',
    \`tender_id\` INT UNSIGNED NOT NULL COMMENT 'procurement_tenders.id',
    \`kind\` VARCHAR(16) NOT NULL DEFAULT 'award' COMMENT 'award/shortlist/lta_holder（P0 仅 award）',
    \`response_id\` BIGINT UNSIGNED DEFAULT NULL COMMENT 'procurement_responses.id',
    \`supplier_id\` INT UNSIGNED NOT NULL COMMENT 'supplier.id',
    \`amount\` DECIMAL(20,2) DEFAULT NULL COMMENT '定标金额（响应汇总）',
    \`currency\` VARCHAR(10) DEFAULT NULL COMMENT '币种',
    \`reason\` VARCHAR(500) NOT NULL COMMENT '定标理由（对外摘要）',
    \`decided_by\` BIGINT UNSIGNED NOT NULL COMMENT '采购方账号 users.id',
    \`approved_by\` VARCHAR(64) DEFAULT NULL COMMENT 'P1 审批人留痕',
    \`approved_at\` INT UNSIGNED DEFAULT NULL COMMENT 'P1 审批时间',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '定标时间（秒）',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_award_project_version_kind_supplier\` (\`project_id\`,\`version_no\`,\`kind\`,\`supplier_id\`),
    KEY \`idx_award_supplier\` (\`supplier_id\`,\`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='定标结果（P0 单家中标，服务层保证 award 唯一）'`,

  `CREATE TABLE IF NOT EXISTS \`procurement_events\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT 'procurement_projects.id',
    \`version_no\` INT UNSIGNED DEFAULT NULL COMMENT '需求版本',
    \`tender_id\` INT UNSIGNED DEFAULT NULL COMMENT 'procurement_tenders.id',
    \`response_id\` BIGINT UNSIGNED DEFAULT NULL COMMENT 'procurement_responses.id',
    \`actor_type\` VARCHAR(16) NOT NULL COMMENT 'buyer/supplier/system/ops',
    \`actor_id\` BIGINT UNSIGNED DEFAULT NULL COMMENT '操作者账号 id',
    \`kind\` VARCHAR(32) NOT NULL COMMENT 'published/opened/response_submitted/response_withdrawn/awarded/closed',
    \`payload\` JSON DEFAULT NULL COMMENT '事件快照',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '发生时间（秒）',
    PRIMARY KEY (\`id\`),
    KEY \`idx_event_project\` (\`project_id\`,\`created_at\`),
    KEY \`idx_event_kind\` (\`kind\`,\`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='采购域审计事件（补 audit_logs 缺口）'`,
];

export const migration: Migration = {
  version: 63,
  name: "procurement_rfq_loop",
  async up(dbPool: Pool): Promise<void> {
    // ① 需求主表：方式列（026 删的是恒为 rfq 的预留列，本次承载真实语义与下游行为）
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "method",
      "method varchar(16) NOT NULL DEFAULT 'rfq' COMMENT '采购方式：rfq/itb/rfp/eoi/lta（P0 仅 rfq 生效）' AFTER object_types",
    );
    await ensureIndex(
      dbPool,
      "procurement_projects",
      "idx_proj_method_status",
      "ALTER TABLE procurement_projects ADD KEY idx_proj_method_status (method, status, published_at)",
    );

    // ② 标讯：密封与评审法、开标时间
    await ensureColumn(
      dbPool,
      "procurement_tenders",
      "sealed",
      "sealed tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否密封：开标前仅提交人可见' AFTER publish_mode",
    );
    await ensureColumn(
      dbPool,
      "procurement_tenders",
      "award_method",
      "award_method varchar(24) NOT NULL DEFAULT 'lowest_price' COMMENT '评审法（P0 仅 lowest_price）' AFTER sealed",
    );
    await ensureColumn(
      dbPool,
      "procurement_tenders",
      "opened_at",
      "opened_at int unsigned DEFAULT NULL COMMENT '开标时间（秒）；到期由定时器写入' AFTER deadline_tz",
    );

    // ③ 响应 / 报价 / 附件 / 定标 / 事件
    for (const ddl of DDL) {
      await dbPool.query(ddl);
    }
  },
};