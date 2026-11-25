/**
 * 迁移 080 · 发票开具结果字段（费用中心发票管理一期）
 *
 * @module lib/db/migrations/080-invoice-issuance
 * @description 发票申请单从“只记录申请”补到“可记录开具结果”：
 *              渠道（人工/第三方 API）、发票号、发票文件、开具时间、经办人、红冲关联、驳回原因。
 *              纯加列（ensureColumn 幂等），不动存量数据。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 80,
  name: "invoice_issuance",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(dbPool, "invoice_requests", "issue_channel",
      "VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '开具渠道：manual 人工 / api 第三方平台' AFTER status");
    await ensureColumn(dbPool, "invoice_requests", "provider",
      "VARCHAR(32) NULL COMMENT '第三方开票平台标识（api 渠道）' AFTER issue_channel");
    await ensureColumn(dbPool, "invoice_requests", "provider_request_id",
      "VARCHAR(100) NULL COMMENT '第三方平台请求/单据号（api 渠道幂等回查）' AFTER provider");
    await ensureColumn(dbPool, "invoice_requests", "invoice_no",
      "VARCHAR(64) NULL COMMENT '发票号码' AFTER provider_request_id");
    await ensureColumn(dbPool, "invoice_requests", "invoice_file_url",
      "VARCHAR(500) NULL COMMENT '发票文件鉴权下载地址' AFTER invoice_no");
    await ensureColumn(dbPool, "invoice_requests", "file_type",
      "VARCHAR(10) NULL COMMENT '发票文件类型：pdf / ofd / xml' AFTER invoice_file_url");
    await ensureColumn(dbPool, "invoice_requests", "issued_at",
      "DATETIME NULL COMMENT '开具时间' AFTER file_type");
    await ensureColumn(dbPool, "invoice_requests", "operator_id",
      "BIGINT UNSIGNED NULL COMMENT '经办人 users.id（人工渠道）' AFTER issued_at");
    await ensureColumn(dbPool, "invoice_requests", "red_flush_of",
      "BIGINT UNSIGNED NULL COMMENT '红冲关联的原申请单 id' AFTER operator_id");
    await ensureColumn(dbPool, "invoice_requests", "reject_reason",
      "VARCHAR(500) NULL COMMENT '驳回/作废原因' AFTER red_flush_of");
  },
};
