/**
 * 012: 找回密码 + 密码安全升级
 * password-reset table + crm_users new columns (password_hash_type, email_verified)
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 12,
  name: "password-reset-security",
  async up(dbPool: Pool) {
    // crm_users 新增列：密码哈希类型（迁移用）
    await ensureColumn(
      dbPool,
      "crm_users",
      "password_hash_type",
      "password_hash_type VARCHAR(20) NOT NULL DEFAULT 'sha256' AFTER password_hash",
    );

    // crm_users 新增列：邮箱验证状态
    await ensureColumn(
      dbPool,
      "crm_users",
      "email_verified",
      "email_verified TINYINT(1) NOT NULL DEFAULT 0",
    );

    // 验证码表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_password_resets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        attempts INT NOT NULL DEFAULT 0,
        ip VARCHAR(45) NULL,
        email_sent TINYINT(1) NOT NULL DEFAULT 0,
        email_error VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_key (user_key),
        KEY idx_code_lookup (user_key, used, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 邮件发送状态字段（用于追踪邮件是否发送成功）
    await ensureColumn(dbPool, "crm_password_resets", "email_sent", "email_sent TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(dbPool, "crm_password_resets", "email_error", "email_error VARCHAR(500) NULL");
  },
};
