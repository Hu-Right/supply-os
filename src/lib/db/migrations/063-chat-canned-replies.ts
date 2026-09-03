/**
 * 063: 客服快捷回复（常用语库，P1）
 * chat-canned-replies
 *
 * DDL 单一来源在 supply-os（intelligence-daily 直连同库读写）。
 * - owner_uid = NULL：团队级共享常用语（sales 部门皆可用，仅 admin 可增删）
 * - owner_uid 非空：客服个人常用语（本人可增删）
 * 内容由客服端维护与展示，客户前台不使用此表。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 63,
  name: "chat-canned-replies",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_canned_replies (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_uid INT UNSIGNED NULL,
        owner_email VARCHAR(190) NULL,
        title VARCHAR(100) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_canned_owner (owner_uid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='客服快捷回复/常用语（P1）'
    `);
  },
};
