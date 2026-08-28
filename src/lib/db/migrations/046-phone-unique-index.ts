/**
 * 046: 手机号唯一索引
 * phone-unique-index
 *
 * 为 crm_users.phone 添加唯一索引，防止同一手机号被多个账户注册。
 * 使用 ALTER IGNORE 风格（先清理重复数据再建索引）。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 46,
  name: "phone-unique-index",
  async up(dbPool: Pool) {
    // 清理 phone 列的重复数据（保留 id 最小的记录）
    await dbPool.query(`
      DELETE u1 FROM crm_users u1
      INNER JOIN crm_users u2
      WHERE u1.id > u2.id
        AND u1.phone IS NOT NULL
        AND u1.phone != ''
        AND u1.phone = u2.phone
    `);

    // 添加唯一索引（忽略 NULL 值，MySQL 唯一索引允许多个 NULL）
    await ensureIndex(
      dbPool,
      "crm_users",
      "idx_users_phone_unique",
      "CREATE UNIQUE INDEX idx_users_phone_unique ON crm_users (phone)",
    );
  },
};
