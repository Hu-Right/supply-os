/**
 * 006: 供应商相关表
 * crm_supplier_claims, crm_supplier_unspsc_interests
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 6,
  name: "suppliers",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_supplier_claims (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        supplier_id BIGINT UNSIGNED NULL,
        company_name VARCHAR(255) NOT NULL,
        supplier_type VARCHAR(40) NOT NULL DEFAULT 'domestic',
        contact_name VARCHAR(100) NULL,
        contact_phone VARCHAR(80) NULL,
        contact_email VARCHAR(190) NULL,
        business_license_no VARCHAR(120) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_status (user_key, status),
        KEY idx_supplier_status (supplier_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_supplier_claims", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_supplier_unspsc_interests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        supplier_id BIGINT UNSIGNED NOT NULL,
        code_id INT NULL,
        code VARCHAR(8) NOT NULL,
        level TINYINT NOT NULL,
        source VARCHAR(40) NOT NULL,
        weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_supplier_code_source (supplier_id, code, source),
        KEY idx_supplier_code (supplier_id, code),
        KEY idx_code_id (code_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
