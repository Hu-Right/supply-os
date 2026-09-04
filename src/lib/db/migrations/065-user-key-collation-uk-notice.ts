/**
 * 065: user_key collation 统一 + uk_user_notice 重建（062 补漏）
 * user-key-collation-uk-notice
 *
 * 修复《user_key 内部化路线图》〇.6 节审计发现 N1/N2：
 *
 * N1 — collation 混杂：crm_refresh_tokens / learning_orders / training_orders
 *      三表整体为 utf8mb4_unicode_ci，与 crm_users（utf8mb4_0900_ai_ci）不一致，
 *      导致 backfillUserIds 的 `JOIN crm_users ON user_key` 抛
 *      `Illegal mix of collations`，回填中断（存量 ~4212 行 user_id 为 NULL）。
 *      整表 CONVERT（而非仅 user_key 列），杜绝其余文本列未来 JOIN 再踩同一坑。
 *
 * N2 — 062 漏项：crm_opportunity_unlocks 存在两个用户唯一键，
 *      uk_user_opportunity 已重建，但 uk_user_notice (user_key, notice_id) 遗漏。
 *      重建为 (user_id, notice_id)；若存量存在 (user_id, notice_id) 重复行，
 *      跳过重建并告警（避免 ADD UNIQUE 失败阻塞服务启动），遗留人工清理。
 *
 * 注意：CONVERT TO 为整表重建（表量级小，秒级）；生产执行放低峰。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 65,
  name: "user-key-collation-uk-notice",
  async up(dbPool: Pool) {
    // ── N1：三表 collation 统一到 crm_users 口径 ─────────────────────────────
    await dbPool.query(
      "ALTER TABLE `crm_refresh_tokens` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
    );
    await dbPool.query(
      "ALTER TABLE `learning_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
    );
    await dbPool.query(
      "ALTER TABLE `training_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
    );

    // ── N2：uk_user_notice 重建（user_key, notice_id）→ (user_id, notice_id) ──
    const [idxRows] = await dbPool.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_unlocks'
         AND INDEX_NAME = 'uk_user_notice'`
    );
    if ((idxRows as RowDataPacket[]).length === 0) {
      console.log("[migration-065] uk_user_notice 不存在，跳过重建");
      return;
    }

    // 重复行保护：存量 (user_id, notice_id) 重复时跳过重建（勿因 ADD UNIQUE 失败阻塞启动）
    const [dupRows] = await dbPool.query(
      `SELECT user_id, notice_id, COUNT(*) AS cnt FROM crm_opportunity_unlocks
       WHERE user_id IS NOT NULL AND notice_id IS NOT NULL
       GROUP BY user_id, notice_id HAVING cnt > 1 LIMIT 5`
    );
    if ((dupRows as RowDataPacket[]).length > 0) {
      console.warn(
        "[migration-065] crm_opportunity_unlocks 存在 (user_id, notice_id) 重复行，跳过 uk_user_notice 重建，需人工去重后重跑"
      );
      return;
    }

    await dbPool.query("ALTER TABLE `crm_opportunity_unlocks` DROP INDEX `uk_user_notice`");
    await dbPool.query(
      "ALTER TABLE `crm_opportunity_unlocks` ADD UNIQUE KEY `uk_user_notice` (`user_id`, `notice_id`)"
    );
    console.log("[migration-065] uk_user_notice 已重建为 (user_id, notice_id)");
  },
};
