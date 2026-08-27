/**
 * 007: UNSPSC 桥接表
 * crm_bid_opportunity_unspsc_codes, crm_bid_notice_unspsc_codes
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 7,
  name: "unspsc-bridge",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_bid_opportunity_unspsc_codes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        opportunity_id BIGINT UNSIGNED NOT NULL,
        code_id INT NULL,
        code VARCHAR(8) NOT NULL,
        level TINYINT NOT NULL,
        level1_id INT NULL,
        level2_id INT NULL,
        level3_id INT NULL,
        level4_id INT NULL,
        level5_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_opp_code (opportunity_id, code),
        KEY idx_code_id (code_id),
        KEY idx_level1 (level1_id),
        KEY idx_level2 (level2_id),
        KEY idx_level3 (level3_id),
        KEY idx_level4 (level4_id),
        KEY idx_level5 (level5_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 注意：实际 CRM 侧 notice_id 为 varchar(100)（存外部编号），
    // 此处 DDL 仅作桥接表不存在时的兜底。
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_bid_notice_unspsc_codes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        notice_id VARCHAR(100) NOT NULL,
        code_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        level TINYINT UNSIGNED NOT NULL DEFAULT 0,
        level1_id VARCHAR(32) NOT NULL DEFAULT '',
        level2_id VARCHAR(32) NOT NULL DEFAULT '',
        level3_id VARCHAR(32) NOT NULL DEFAULT '',
        level4_id VARCHAR(32) NOT NULL DEFAULT '',
        level5_id VARCHAR(32) NOT NULL DEFAULT '',
        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_notice_code (notice_id, code),
        KEY idx_code (code),
        KEY idx_notice_level1_notice (level1_id, notice_id),
        KEY idx_notice_level2_notice (level2_id, notice_id),
        KEY idx_notice_level3_notice (level3_id, notice_id),
        KEY idx_notice_level4_notice (level4_id, notice_id),
        KEY idx_notice_level5_notice (level5_id, notice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 补充索引（幂等）
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level1_notice", "CREATE INDEX idx_notice_level1_notice ON crm_bid_notice_unspsc_codes (level1_id, notice_id)");
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level2_notice", "CREATE INDEX idx_notice_level2_notice ON crm_bid_notice_unspsc_codes (level2_id, notice_id)");
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level3_notice", "CREATE INDEX idx_notice_level3_notice ON crm_bid_notice_unspsc_codes (level3_id, notice_id)");
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level4_notice", "CREATE INDEX idx_notice_level4_notice ON crm_bid_notice_unspsc_codes (level4_id, notice_id)");
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level5_notice", "CREATE INDEX idx_notice_level5_notice ON crm_bid_notice_unspsc_codes (level5_id, notice_id)");
    await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_code_notice", "CREATE INDEX idx_notice_code_notice ON crm_bid_notice_unspsc_codes (code, notice_id)");
  },
};
