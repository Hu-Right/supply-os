/**
 * 071: crm_bid_notices RFQ 商务条款结构化列
 * rfq-business-terms
 *
 * 背景：此前 RFQ 的商务条款（贸易术语/付款方式/交付信息等）拼接在
 * description 尾部、联系人姓名借用 agency 列，无法查询与结构化展示。
 * 前端表单本就提交结构化字段，本迁移补齐独立列并回填联系人。
 *
 * 新增列：
 * - contact_name       VARCHAR(100) 联系人姓名（替代借用 agency 列）
 * - budget_confidential TINYINT(1)   预算保密标记
 * - incoterm           VARCHAR(20)  贸易术语（EXW/FCA/FOB/...）
 * - delivery_time      VARCHAR(200) 交付时间说明
 * - delivery_address   VARCHAR(500) 交付地点
 * - payment_terms      VARCHAR(300) 付款方式（逗号分隔多选）
 * - supplier_reqs      VARCHAR(500) 供应商资质要求（逗号分隔多选）
 * - visibility         VARCHAR(20)  可见范围（public/targeted）
 *
 * 注：currency / budget_min / budget_max 暂不建列，预算统一使用人民币单值
 *     通过 estimated_value 字段存储，后续视需求再决定是否独立建列。
 *
 * 回填：历史平台 RFQ 的 contact_name 从 agency 列迁移。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 71,
  name: "rfq-business-terms",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool, "crm_bid_notices", "contact_name",
      "contact_name VARCHAR(100) NULL COMMENT 'RFQ联系人姓名'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "budget_confidential",
      "budget_confidential TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'RFQ预算保密标记'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "incoterm",
      "incoterm VARCHAR(20) NULL COMMENT 'RFQ贸易术语: EXW, FCA, FOB, CFR, CIF, DAP, DDP'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "delivery_time",
      "delivery_time VARCHAR(200) NULL COMMENT 'RFQ交付时间说明'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "delivery_address",
      "delivery_address VARCHAR(500) NULL COMMENT 'RFQ交付地点'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "payment_terms",
      "payment_terms VARCHAR(300) NULL COMMENT 'RFQ付款方式（逗号分隔多选）'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "supplier_reqs",
      "supplier_reqs VARCHAR(500) NULL COMMENT 'RFQ供应商资质要求（逗号分隔多选）'",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "visibility",
      "visibility VARCHAR(20) NOT NULL DEFAULT 'public' COMMENT 'RFQ可见范围: public, targeted'",
    );

    // 回填：历史平台 RFQ 联系人姓名从 agency 列迁移（仅平台来源行）
    await dbPool.query(
      `UPDATE crm_bid_notices SET contact_name = agency
       WHERE entry_source = 'platform' AND notice_type = 'RFQ'
         AND (contact_name IS NULL OR contact_name = '')
         AND agency IS NOT NULL AND agency <> ''`,
    );

    console.log("[migration-071] crm_bid_notices RFQ 商务条款列已就绪");
  },
};
