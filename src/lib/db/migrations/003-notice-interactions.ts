/**
 * 003: 公告交互表
 * crm_opportunity_unlocks, crm_user_notice_views, crm_notice_interests,
 * crm_user_interest_codes, crm_user_industry_prefs
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 3,
  name: "notice-interactions",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_opportunity_unlocks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        opportunity_id BIGINT UNSIGNED NULL,
        notice_id BIGINT UNSIGNED NULL,
        unlock_type ENUM('free','single','subscription') NOT NULL DEFAULT 'free',
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unspsc_codes_snapshot JSON NULL,
        UNIQUE KEY uk_user_opportunity (user_key, opportunity_id),
        KEY idx_user_type_time (user_key, unlock_type, unlocked_at),
        KEY idx_opportunity_id (opportunity_id),
        KEY idx_notice_id (notice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_notice_views (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        opportunity_id BIGINT UNSIGNED NULL,
        notice_id BIGINT UNSIGNED NULL,
        viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip VARCHAR(45) NULL,
        KEY idx_user_time (user_key, viewed_at),
        KEY idx_opportunity_view (opportunity_id),
        KEY idx_notice_view (notice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_interests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        notice_id BIGINT UNSIGNED NOT NULL,
        interest_type ENUM('interested','subscribed') NOT NULL DEFAULT 'interested',
        source VARCHAR(40) NOT NULL DEFAULT 'detail_page',
        note VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_notice_type (user_key, notice_id, interest_type),
        KEY idx_user_time (user_key, created_at),
        KEY idx_notice_type (notice_id, interest_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_notice_interests", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_interest_codes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        code_id INT NULL,
        code VARCHAR(8) NOT NULL,
        level TINYINT NOT NULL,
        source VARCHAR(40) NOT NULL,
        weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_code_source (user_key, code, source),
        KEY idx_user_code (user_key, code),
        KEY idx_code_id (code_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_industry_prefs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL,
        level1_id INT NULL,
        level2_id INT NULL,
        level3_id INT NULL,
        level4_id INT NULL,
        level5_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_pref (user_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
