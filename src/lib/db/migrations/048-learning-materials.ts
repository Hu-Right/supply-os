/**
 * 048: 学习资料表
 * learning-materials
 *
 * 将学习资料元数据从静态 TS 文件迁移至数据库，支持后台管理动态增删改。
 * 种子数据已禁用——仅保留建表 DDL。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 48,
  name: "learning-materials",
  async up(dbPool: Pool) {
    // ── 表结构 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_learning_materials (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        material_id VARCHAR(64) NOT NULL COMMENT '资料唯一标识（如 training-doc-01）',
        title_zh VARCHAR(255) NOT NULL,
        title_en VARCHAR(255) NOT NULL DEFAULT '',
        content_zh TEXT,
        content_en TEXT,
        category_zh VARCHAR(64) NOT NULL DEFAULT '',
        category_en VARCHAR(64) NOT NULL DEFAULT '',
        summary_zh VARCHAR(500) NOT NULL DEFAULT '',
        summary_en VARCHAR(500) NOT NULL DEFAULT '',
        price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价（元）',
        file_url VARCHAR(500) NOT NULL DEFAULT '' COMMENT '静态文件路径',
        file_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '下载文件名',
        downloads_count INT UNSIGNED NOT NULL DEFAULT 0,
        is_premium TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否付费',
        number INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '展示编号',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_material_id (material_id),
        INDEX idx_category (category_zh),
        INDEX idx_number (number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习资料表'
    `);

    // 种子数据已禁用——仅建表，不再写入任何种子记录
  },
};
