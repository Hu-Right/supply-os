/**
 * 073: 公告收藏表
 * notice-favorites
 *
 * 新增一张表：
 * - crm_notice_favorites：用户私有收藏（书签），与 crm_notice_interests
 *   （意向/订阅，销售线索）动作语义分离，不互相写入
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 73,
  name: "notice-favorites",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_favorites (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        notice_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_notice (user_id, notice_id),
        KEY idx_user_created (user_id, created_at),
        KEY idx_notice (notice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[migration-073] 公告收藏表已就绪");
  },
};
