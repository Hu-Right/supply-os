/**
 * 023: 底部社交媒体链接表
 * crm.link 表用于存储页脚社交媒体链接（iconfont 字体图标渲染）
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 23,
  name: "footer-social-links",
  async up(dbPool: Pool) {
    // 建表（IF NOT EXISTS，已存在则跳过）
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS \`crm\`.\`link\` (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '链接显示名称',
        url VARCHAR(255) NOT NULL COMMENT '链接地址',
        icon VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'iconfont 图标 class 名',
        sort_order INT NOT NULL DEFAULT 0 COMMENT '排序权重（越小越靠前）',
        status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='底部社交媒体链接'
    `);

    // 逐列确保（使用表名 link，不带库名前缀，避免 INFORMATION_SCHEMA 查询失败）
    await ensureColumn(dbPool, "link", "name",
      "name VARCHAR(100) NOT NULL COMMENT '链接显示名称' AFTER id");
    await ensureColumn(dbPool, "link", "url",
      "url VARCHAR(255) NOT NULL COMMENT '链接地址' AFTER name");
    await ensureColumn(dbPool, "link", "icon",
      "icon VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'iconfont 图标 class 名' AFTER url");
    await ensureColumn(dbPool, "link", "sort_order",
      "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序权重（越小越靠前）' AFTER icon");
    await ensureColumn(dbPool, "link", "status",
      "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用' AFTER sort_order");

    // 索引（ensureIndex 内部检查是否已存在）
    await ensureIndex(dbPool, "link", "idx_link_status_sort",
      "CREATE INDEX idx_link_status_sort ON \`crm\`.\`link\` (status, sort_order, id)");
  },
};
