/**
 * 迁移 015 · F05 主体核验回调幂等键
 *
 * @module server/db/migrations/015-buyer-verification-callback
 * @description 站外核验后台经 HMAC 回调写 procurement_buyer_verifications。
 *              回调可能重试，故给留痕行加 callback_id 并建 (buyer_id, callback_id)
 *              唯一索引：同一请求只落一行，重复投递返回首条结果（幂等）。
 *              列可空（历史/人工补录行不受唯一约束影响，MySQL 唯一索引允许多个 NULL）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 15,
  name: "buyer_verification_callback",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_buyer_verifications",
      "callback_id",
      "callback_id varchar(64) DEFAULT NULL COMMENT '核验回调幂等键（X-Review-Request-Id）'",
    );
    await ensureIndex(
      dbPool,
      "procurement_buyer_verifications",
      "uq_buyer_verify_callback",
      "ALTER TABLE procurement_buyer_verifications ADD UNIQUE KEY uq_buyer_verify_callback (buyer_id, callback_id)",
    );
  },
};
