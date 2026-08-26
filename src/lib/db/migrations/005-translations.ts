/**
 * 005: 翻译相关表
 * crm_notice_translations, crm_opportunity_translations, crm_translation_state,
 * crm_supplier_translations, crm_unspsc_translations
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 5,
  name: "translations",
  async up(dbPool: Pool) {
    // 公告翻译
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_translations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        notice_id BIGINT UNSIGNED NOT NULL,
        lang VARCHAR(10) NOT NULL,
        title_tr TEXT NULL,
        description_tr MEDIUMTEXT NULL,
        model VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_notice_lang (notice_id, lang),
        KEY idx_lang (lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 翻译状态追踪
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_translation_state (
        state_key VARCHAR(64) NOT NULL PRIMARY KEY,
        state_value VARCHAR(255) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // 水位定格
    await dbPool.query(`
      INSERT IGNORE INTO crm_translation_state (state_key, state_value)
      SELECT 'notice_id_cutoff', CAST(COALESCE(MAX(id), 0) AS CHAR)
        FROM crm_bid_notices
    `);

    // 精选数据翻译
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_opportunity_translations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        opportunity_id BIGINT UNSIGNED NOT NULL,
        lang VARCHAR(10) NOT NULL,
        title_tr TEXT NULL,
        description_tr MEDIUMTEXT NULL,
        model VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_opp_lang (opportunity_id, lang),
        KEY idx_opp_tr_lang (lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await dbPool.query(`
      INSERT IGNORE INTO crm_translation_state (state_key, state_value)
      SELECT 'opportunity_id_cutoff', CAST(COALESCE(MAX(id), 0) AS CHAR)
        FROM crm_bid_opportunities
    `);

    // 供应商翻译
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_supplier_translations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        supplier_id BIGINT UNSIGNED NOT NULL,
        lang VARCHAR(10) NOT NULL,
        industry_tr VARCHAR(255) NULL,
        main_products_tr TEXT NULL,
        certification_tr TEXT NULL,
        enterprise_nature_tr VARCHAR(100) NULL,
        model VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_supplier_lang (supplier_id, lang),
        KEY idx_supplier_lang (lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // UNSPSC 类目译文
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_unspsc_translations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code_id INT NOT NULL,
        lang VARCHAR(10) NOT NULL,
        title_tr VARCHAR(255) NULL,
        model VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_code_lang (code_id, lang),
        KEY idx_unspsc_tr_lang (lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
