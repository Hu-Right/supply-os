/**
 * 004: 搜索、质量、统计与反馈表
 * crm_user_search_log, crm_data_quality_snapshot, crm_notice_stats,
 * crm_notice_amount_cache, crm_notice_view_daily,
 * crm_user_reco_feedback, crm_reco_weight_profile
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 4,
  name: "search-quality-feedback",
  async up(dbPool: Pool) {
    // 搜索行为流水
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_search_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(190) NULL,
        q VARCHAR(200) NULL,
        country VARCHAR(100) NULL,
        filters JSON NULL,
        result_cnt INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_time (user_key, created_at),
        KEY idx_zero_result (result_cnt, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 数据质量快照
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_data_quality_snapshot (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        snapshot_date DATE NOT NULL,
        total_notices INT NOT NULL,
        missing_value INT NOT NULL DEFAULT 0,
        missing_country INT NOT NULL DEFAULT 0,
        missing_deadline INT NOT NULL DEFAULT 0,
        unlinked_unspsc INT NOT NULL DEFAULT 0,
        expired_but_active INT NOT NULL DEFAULT 0,
        dup_notice_cnt INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_date (snapshot_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 预计算总数统计
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_stats (
        stat_key VARCHAR(100) NOT NULL PRIMARY KEY,
        stat_value INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 金额解析缓存
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_amount_cache (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        notice_id BIGINT UNSIGNED NOT NULL,
        amount DECIMAL(20,2) NULL,
        currency VARCHAR(10) NULL,
        amount_usd DECIMAL(20,2) NULL,
        inferred TINYINT(1) NOT NULL DEFAULT 0,
        parse_version SMALLINT NOT NULL DEFAULT 1,
        parsed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_notice (notice_id),
        KEY idx_version (parse_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 浏览量日汇总
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_view_daily (
        notice_id BIGINT UNSIGNED NOT NULL,
        stat_day DATE NOT NULL,
        view_cnt INT NOT NULL DEFAULT 0,
        uniq_user_cnt INT NOT NULL DEFAULT 0,
        PRIMARY KEY (notice_id, stat_day)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 推荐反馈流水
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_reco_feedback (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        notice_id BIGINT UNSIGNED NOT NULL,
        action ENUM('impression','click','unlock','dismiss','favorite','dwell','scroll_end','quick_exit','revisit') NOT NULL,
        reco_score DECIMAL(8,4) NULL,
        position INT NULL,
        variant VARCHAR(20) NULL,
        session_id VARCHAR(64) NULL,
        dwell_ms INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_dedup (user_key, notice_id, session_id, action),
        KEY idx_user_time (user_key, created_at),
        KEY idx_notice_action (notice_id, action),
        KEY idx_variant (variant, action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 权重档案
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_reco_weight_profile (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL,
        w_unspsc DECIMAL(5,3) NOT NULL DEFAULT 0.500,
        w_agency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
        w_amount DECIMAL(5,3) NOT NULL DEFAULT 0.100,
        w_geo DECIMAL(5,3) NOT NULL DEFAULT 0.100,
        w_urgency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user (user_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
