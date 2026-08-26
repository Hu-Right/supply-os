/**
 * 020: 解锁唯一约束（防并发超额）
 * unlock-unique-notice
 *
 * 为 crm_opportunity_unlocks 添加 (user_key, notice_id) 唯一索引，
 * 从数据库层面防止同一用户对同一公告重复解锁（TOCTOU 竞态条件）。
 * 添加前先清理已有重复数据（保留最早一条）。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 20,
  name: "unlock-unique-notice",
  async up(dbPool: Pool) {
    // 清理重复数据：同一 (user_key, notice_id) 只保留 id 最小的一条
    await dbPool.query(`
      DELETE t1 FROM crm_opportunity_unlocks t1
      INNER JOIN (
        SELECT user_key, notice_id, MIN(id) AS keep_id
        FROM crm_opportunity_unlocks
        WHERE notice_id IS NOT NULL
        GROUP BY user_key, notice_id
        HAVING COUNT(*) > 1
      ) t2 ON t1.user_key = t2.user_key AND t1.notice_id = t2.notice_id AND t1.id <> t2.keep_id
    `);

    // 添加唯一索引
    await ensureIndex(
      dbPool,
      "crm_opportunity_unlocks",
      "uk_user_notice",
      "ALTER TABLE crm_opportunity_unlocks ADD UNIQUE INDEX uk_user_notice (user_key, notice_id)",
    );
  },
};
