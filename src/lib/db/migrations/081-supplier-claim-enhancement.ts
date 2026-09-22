/**
 * 081: 供应商认领流程增强
 *
 * - supplier 表新增 license_url（营业执照图片）+ claim_status（认领状态）
 * - crm_supplier_claims 表新增 expires_at（过期时间）+ license_url（执照图片）
 *
 * claim_status 三态：
 *   NULL          = 可认领（默认，含爬虫导入的存量数据）
 *   'pending'     = 已被临时绑定，等待用户上传执照完善信息
 *   'verified'    = 已通过审核，永久绑定
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 81,
  name: "supplier-claim-enhancement",
  async up(dbPool: Pool) {
    // ── 1. supplier 表新增列 ──

    await ensureColumn(
      dbPool,
      "supplier",
      "license_url",
      "license_url VARCHAR(500) NULL COMMENT '营业执照图片URL' AFTER verify_status",
    );

    await ensureColumn(
      dbPool,
      "supplier",
      "claim_status",
      "claim_status VARCHAR(20) NULL COMMENT '认领状态: NULL=可认领, pending=临时绑定待完善, verified=已认证' AFTER license_url",
    );

    await ensureIndex(
      dbPool,
      "supplier",
      "idx_claim_status",
      "CREATE INDEX idx_claim_status ON supplier (claim_status)",
    );

    // ── 2. crm_supplier_claims 表新增列 ──

    await ensureColumn(
      dbPool,
      "crm_supplier_claims",
      "license_url",
      "license_url VARCHAR(500) NULL COMMENT '营业执照图片URL' AFTER business_license_no",
    );

    await ensureColumn(
      dbPool,
      "crm_supplier_claims",
      "expires_at",
      "expires_at DATETIME NULL COMMENT '临时绑定过期时间（7天）' AFTER license_url",
    );

    await ensureIndex(
      dbPool,
      "crm_supplier_claims",
      "idx_expires_at",
      "CREATE INDEX idx_expires_at ON crm_supplier_claims (expires_at)",
    );
  },
};
