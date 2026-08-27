/**
 * 001: 核心基础表
 * system, crm_users, crm_training_registrations, ungm_1v1_appointments
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 1,
  name: "core-tables",
  async up(dbPool: Pool) {
    // 系统配置表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS \`system\` (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        bah VARCHAR(120) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 用户表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL UNIQUE,
        email VARCHAR(190) NULL,
        display_name VARCHAR(190) NULL,
        password_hash VARCHAR(128) NULL,
        membership_tier VARCHAR(40) NOT NULL DEFAULT 'free',
        account_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        supplier_id BIGINT UNSIGNED NULL,
        supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_users", "password_hash", "password_hash VARCHAR(128) NULL AFTER display_name");
    await ensureColumn(dbPool, "crm_users", "membership_tier", "membership_tier VARCHAR(40) NOT NULL DEFAULT 'free' AFTER password_hash");
    await ensureColumn(dbPool, "crm_users", "account_status", "account_status VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER membership_tier");
    await ensureColumn(dbPool, "crm_users", "supplier_id", "supplier_id BIGINT UNSIGNED NULL AFTER membership_tier");
    await ensureColumn(dbPool, "crm_users", "supplier_link_status", "supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none' AFTER supplier_id");
    await ensureIndex(dbPool, "crm_users", "idx_supplier_link", "CREATE INDEX idx_supplier_link ON crm_users (supplier_id, supplier_link_status)");

    // 培训注册表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_training_registrations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        legacy_supplier_id BIGINT UNSIGNED NULL UNIQUE,
        company_name VARCHAR(255) NOT NULL,
        industry_id INT NULL,
        industry VARCHAR(255) NULL,
        main_product VARCHAR(255) NULL,
        export_experience VARCHAR(255) NULL,
        certification TEXT NULL,
        contact_name VARCHAR(100) NOT NULL,
        position VARCHAR(100) NULL,
        telephone VARCHAR(50) NOT NULL,
        email VARCHAR(190) NULL,
        remark TEXT NULL,
        audit_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        ip VARCHAR(45) NULL,
        KEY idx_training_status (audit_status),
        KEY idx_training_contact (telephone, email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 1v1 预约表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ungm_1v1_appointments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        appointment_key VARCHAR(190) NOT NULL UNIQUE,
        company_name VARCHAR(255) NOT NULL,
        country VARCHAR(120) NULL,
        city VARCHAR(120) NULL,
        contact_person VARCHAR(190) NOT NULL,
        contact_method VARCHAR(190) NOT NULL,
        email VARCHAR(190) NULL,
        industry VARCHAR(190) NULL,
        consultation_needs TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'new',
        follow_up_logs JSON NULL,
        extra JSON NULL,
        raw_payload JSON NULL,
        ip VARCHAR(80) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ungm_1v1_status_created (status, created_at),
        INDEX idx_ungm_1v1_contact_method (contact_method)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
