/**
 * 060: 用户昵称列（展示名与真实姓名分离）
 * user-nickname
 *
 * 隐私整改（docs/用户昵称化与隐私保护技术方案.md）：
 * - 新增 nickname 列作为唯一对外展示名；display_name 列保留存真实姓名，从 API 响应中退场
 * - nickname_source 区分自动生成（1）与用户自定义（2），回填脚本以 NULL + source=1 幂等补齐
 * - 回填前备份 display_name 原值（双保险，backup 表幂等可重跑）
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 60,
  name: "user-nickname",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_users",
      "nickname",
      "nickname VARCHAR(100) NULL AFTER display_name",
    );
    await ensureColumn(
      dbPool,
      "crm_users",
      "nickname_source",
      "nickname_source TINYINT NOT NULL DEFAULT 1 COMMENT '1=auto-generated, 2=user-set' AFTER nickname",
    );

    // 回滚保险：备份 display_name 原值（幂等：主键 INSERT IGNORE，重跑不重复）
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_users_nickname_backup_20260903 (
        id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        user_key VARCHAR(190) NOT NULL,
        display_name VARCHAR(190) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await dbPool.query(`
      INSERT IGNORE INTO crm_users_nickname_backup_20260903 (id, user_key, display_name)
      SELECT id, user_key, display_name FROM crm_users
    `);
  },
};
