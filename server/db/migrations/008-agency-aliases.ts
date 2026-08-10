/**
 * 008: 机构别名映射表
 * crm_agency_aliases
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 8,
  name: "agency-aliases",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_agency_aliases (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        canonical VARCHAR(255) NOT NULL COMMENT '标准机构名（展示用）',
        alias VARCHAR(255) NOT NULL COMMENT '别名（匹配用，大写存储）',
        name_i18n JSON NULL COMMENT '机构名多语言翻译 {zh, fr, ru, es, ar}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_alias (alias),
        KEY idx_canonical (canonical)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_agency_aliases", "name_i18n", "name_i18n JSON NULL COMMENT '机构名多语言翻译 {zh, fr, ru, es, ar}'");
  },
};
