/**
 * 068: DROP COLUMN crm_users.user_key（身份体系纯 user_id 化终局）
 * drop-crm-users-user-key
 *
 * 前置条件（已全部满足）：
 * - 迁移 062：18 张业务表 user_id 列 + UNIQUE KEY 重建完成
 * - 迁移 065：collation 统一 + uk_user_notice 重建完成
 * - 迁移 066：业务表 user_key 放松为可空（crm_users 除外）
 * - 迁移 067：crm_consent_log 补 user_id 列
 * - 代码侧：所有 crm_users.user_key 的 READ 依赖已清除（commit 719e96af）
 * - 代码侧：create() INSERT 中 user_key 占位已移除（本迁移配套）
 * - 代码侧：backfillUserIds 已移除（JOIN 依赖不再存在）
 *
 * 本迁移执行：
 * 1. 冷备份 crm_users.user_key 到独立表（回滚保险）
 * 2. DROP COLUMN user_key（MySQL 自动删除关联的 UNIQUE 索引）
 *
 * 回滚方案：
 *   ALTER TABLE crm_users ADD COLUMN user_key VARCHAR(190) NULL AFTER id;
 *   UPDATE crm_users u INNER JOIN crm_users_user_key_backup_20260904 b ON u.id = b.id
 *     SET u.user_key = b.user_key;
 *   ALTER TABLE crm_users ADD UNIQUE KEY user_key (user_key);
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 68,
  name: "drop-crm-users-user-key",
  async up(dbPool: Pool) {
    // ── 1. 冷备份（幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE） ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_users_user_key_backup_20260904 (
        id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await dbPool.query(`
      INSERT IGNORE INTO crm_users_user_key_backup_20260904 (id, user_key)
      SELECT id, user_key FROM crm_users WHERE user_key IS NOT NULL
    `);

    // ── 2. 探测列是否存在（幂等：重跑不报错） ──
    const [colRows] = await dbPool.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_users' AND COLUMN_NAME = 'user_key'`,
    );
    if (Number((colRows as RowDataPacket[])[0]?.total || 0) === 0) {
      console.log("[migration-068] crm_users.user_key 列已不存在，跳过 DROP");
      return;
    }

    // ── 3. DROP COLUMN（MySQL 自动删除关联的 UNIQUE 索引 user_key） ──
    await dbPool.query("ALTER TABLE `crm_users` DROP COLUMN `user_key`");
    console.log("[migration-068] crm_users.user_key 列已删除（冷备份存于 crm_users_user_key_backup_20260904）");
  },
};
