/**
 * 016: 用户手机号绑定
 * user-phone
 *
 * 为 crm_users 表添加 phone / phone_verified 字段，支持手机号绑定与换绑。
 * Add phone / phone_verified columns to crm_users for phone binding & rebind.
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 16,
  name: "user-phone",
  async up(dbPool: Pool) {
    // 手机号（可选绑定，用于辅助找回密码）
    await ensureColumn(
      dbPool,
      "crm_users",
      "phone",
      "phone VARCHAR(20) NULL AFTER email",
    );

    // 手机验证状态
    await ensureColumn(
      dbPool,
      "crm_users",
      "phone_verified",
      "phone_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER phone",
    );

    // 唯一索引：同一手机号不能被多个用户绑定
    await ensureIndex(
      dbPool,
      "crm_users",
      "idx_users_phone",
      "CREATE UNIQUE INDEX idx_users_phone ON crm_users (phone)",
    );
  },
};
