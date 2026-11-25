/**
 * 迁移 081 · 发票购买方开票信息补全（开户行/账号/电话/买方类型）
 *
 * @module lib/db/migrations/081-invoice-buyer-fields
 * @description 会计开票需要完整购买方信息：专票需要开户行与银行账号；
 *              电话从“注册地址与电话”中拆出；区分企业/个人抬头（个人仅普票）。
 *              纯加列（ensureColumn 幂等），不动存量数据。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 81,
  name: "invoice_buyer_fields",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(dbPool, "invoice_requests", "buyer_type",
      "VARCHAR(16) NOT NULL DEFAULT 'enterprise' COMMENT '购买方类型：enterprise 企业 / personal 个人' AFTER address_phone");
    await ensureColumn(dbPool, "invoice_requests", "phone",
      "VARCHAR(40) NULL COMMENT '购买方联系电话' AFTER buyer_type");
    await ensureColumn(dbPool, "invoice_requests", "bank_name",
      "VARCHAR(200) NULL COMMENT '开户行（专票）' AFTER phone");
    await ensureColumn(dbPool, "invoice_requests", "bank_account",
      "VARCHAR(100) NULL COMMENT '银行账号（专票）' AFTER bank_name");
  },
};
