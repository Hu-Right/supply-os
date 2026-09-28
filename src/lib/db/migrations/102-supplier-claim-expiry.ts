/**
 * 102: 供应商认领 7 天有效期数据修复（认领排他落实）
 *
 * 此前 releaseExpiredClaims 从未被调度，且存量认领记录 expires_at 全为 NULL，
 * 过期释放从未真正发生过。本迁移做两件事：
 * - 给仍有效的 pending 认领补齐 expires_at = created_at + 7 天（调度器按此判定过期）；
 * - supplier_id 为 NULL 的历史 pending 认领（自由文本残留，永远无法完成归属，也不被
 *   释放语句的 JOIN 命中）直接置 expired，不再无限占用"有效认领"口径。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 102,
  name: "supplier-claim-expiry-backfill",
  async up(dbPool: Pool) {
    await dbPool.query(`
      UPDATE crm_supplier_claims
         SET expires_at = DATE_ADD(created_at, INTERVAL 7 DAY)
       WHERE status = 'pending' AND expires_at IS NULL
         AND supplier_id IS NOT NULL AND created_at IS NOT NULL
    `);

    await dbPool.query(`
      UPDATE crm_supplier_claims
         SET status = 'expired'
       WHERE status = 'pending' AND supplier_id IS NULL
    `);

    console.log("[migration-102] 认领过期时间已回填，无主体历史认领已置 expired");
  },
};
