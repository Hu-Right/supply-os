/**
 * 011: 搜索宽表
 * crm_notice_search — 搜索专用宽表
 *
 * @module server/db/migrations/011-notice-search-wide-table
 * @description 将 crm_bid_notices + crm_notice_translations + crm_bid_opportunities
 *              + crm_bid_notice_unspsc_codes 的核心搜索字段整合为单表，
 *              消除搜索时的多表 JOIN 和运行时函数计算。
 *              不修改任何现有表结构。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 11,
  name: "notice-search-wide-table",
  async up(dbPool: Pool) {
    // ── 创建宽表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_search (
        id              INT UNSIGNED NOT NULL PRIMARY KEY,
        notice_id       VARCHAR(100) NOT NULL,

        -- 全文搜索字段（原文 + 六国语言翻译）
        title           VARCHAR(1000) NOT NULL DEFAULT '',
        reference       VARCHAR(200)  NOT NULL DEFAULT '',
        description     LONGTEXT      NOT NULL,
        -- 中文
        title_zh        VARCHAR(1000) NOT NULL DEFAULT '',
        description_zh  LONGTEXT      NOT NULL,
        -- 英文
        title_en        VARCHAR(1000) NOT NULL DEFAULT '',
        description_en  LONGTEXT      NOT NULL,
        -- 法文
        title_fr        VARCHAR(1000) NOT NULL DEFAULT '',
        description_fr  LONGTEXT      NOT NULL,
        -- 俄文
        title_ru        VARCHAR(1000) NOT NULL DEFAULT '',
        description_ru  LONGTEXT      NOT NULL,
        -- 西班牙文
        title_es        VARCHAR(1000) NOT NULL DEFAULT '',
        description_es  LONGTEXT      NOT NULL,
        -- 阿拉伯文
        title_ar        VARCHAR(1000) NOT NULL DEFAULT '',
        description_ar  LONGTEXT      NOT NULL,

        -- 预标准化筛选字段
        country_std     VARCHAR(100)  NOT NULL DEFAULT '',
        agency_std      VARCHAR(200)  NOT NULL DEFAULT '',
        agency_group    VARCHAR(100)  NOT NULL DEFAULT '',
        notice_type_std VARCHAR(20)   NOT NULL DEFAULT '',

        -- 数值/日期筛选
        deadline_sec    INT UNSIGNED  NOT NULL DEFAULT 0,
        estimated_value DECIMAL(20,2) NOT NULL DEFAULT 0.00,
        is_active       TINYINT(1)    NOT NULL DEFAULT 1,
        is_featured     TINYINT(1)    NOT NULL DEFAULT 0,

        -- UNSPSC 分类（各层级 ID，逗号分隔；一条公告可能关联多个码，需足够宽度）
        unspsc_level1   VARCHAR(2000) NOT NULL DEFAULT '',
        unspsc_level2   VARCHAR(2000) NOT NULL DEFAULT '',
        unspsc_level3   VARCHAR(2000) NOT NULL DEFAULT '',
        unspsc_level4   VARCHAR(2000) NOT NULL DEFAULT '',
        unspsc_level5   VARCHAR(2000) NOT NULL DEFAULT '',

        -- 展示字段（来自 opportunities + 预计算）
        description_cn  VARCHAR(500)  NOT NULL DEFAULT '',
        bid_overview    VARCHAR(200)  NOT NULL DEFAULT '',
        beneficiary_countries VARCHAR(300) NOT NULL DEFAULT '',
        documents_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,

        -- 同步追踪
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        -- ═══ 索引 ═══
        -- 全文索引（包含所有语言字段）
        FULLTEXT INDEX ft_search_all (title, reference, description, title_zh, description_zh, title_en, description_en, title_fr, description_fr, title_ru, description_ru, title_es, description_es, title_ar, description_ar),

        -- 筛选复合索引
        INDEX idx_ns_active_deadline (is_active, deadline_sec),
        INDEX idx_ns_country_active (country_std, is_active),
        INDEX idx_ns_agency_group (agency_group, is_active),
        INDEX idx_ns_type_active (notice_type_std, is_active),
        INDEX idx_ns_featured_active (is_featured, is_active),

        -- 排序索引
        INDEX idx_ns_deadline_desc (deadline_sec DESC),
        INDEX idx_ns_id_desc (id DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 幂等补建索引（宽表已存在但缺少某些索引的场景）
    await ensureIndex(dbPool, "crm_notice_search", "ft_search_all",
      "CREATE FULLTEXT INDEX ft_search_all ON crm_notice_search (title, reference, description, title_zh, description_zh, title_en, description_en, title_fr, description_fr, title_ru, description_ru, title_es, description_es, title_ar, description_ar)");
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_active_deadline",
      "CREATE INDEX idx_ns_active_deadline ON crm_notice_search (is_active, deadline_sec)");
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_country_active",
      "CREATE INDEX idx_ns_country_active ON crm_notice_search (country_std, is_active)");
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_agency_group",
      "CREATE INDEX idx_ns_agency_group ON crm_notice_search (agency_group, is_active)");
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_type_active",
      "CREATE INDEX idx_ns_type_active ON crm_notice_search (notice_type_std, is_active)");
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_featured_active",
      "CREATE INDEX idx_ns_featured_active ON crm_notice_search (is_featured, is_active)");

    // 幂等添加六国语言列（表已存在时需要 ALTER TABLE）
    const langs = ["fr", "ru", "es", "ar"];
    for (const lang of langs) {
      try {
        await dbPool.query(`ALTER TABLE crm_notice_search ADD COLUMN title_${lang} VARCHAR(1000) NOT NULL DEFAULT ''`);
      } catch { /* 列已存在 */ }
      try {
        await dbPool.query(`ALTER TABLE crm_notice_search ADD COLUMN description_${lang} VARCHAR(2000) NOT NULL DEFAULT ''`);
      } catch { /* 列已存在 */ }
    }

    // 修复：UNSPSC 列扩容（一条公告可能关联大量 UNSPSC 码，GROUP_CONCAT 结果可能超 200 字符）
    for (let level = 1; level <= 5; level++) {
      try {
        await dbPool.query(
          `ALTER TABLE crm_notice_search MODIFY COLUMN unspsc_level${level} VARCHAR(2000) NOT NULL DEFAULT ''`
        );
      } catch {
        // 列不存在或已是目标类型，静默跳过
      }
    }
  },
};
