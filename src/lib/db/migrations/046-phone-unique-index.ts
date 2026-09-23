/**
 * 046: 手机号唯一索引
 * phone-unique-index
 *
 * 为 crm_users.phone 添加唯一索引，防止同一手机号被多个账户注册。
 * 使用 ALTER IGNORE 风格（先清理重复数据再建索引）。
 *
 * （原 ensureIndex idx_users_phone_unique 已退役：全新环境的 phone 唯一索引
 *   由迁移 016 以目标名 uk_phone 出生即建，本迁移保留历史去重动作防止存量
 *   脏数据复活；存量环境的双索引收敛在阶段三 RENAME，见 shadow-users-phase1。）
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 46,
  name: "phone-unique-index",
  async up(dbPool: Pool) {
    // 清理 phone 列的重复数据（保留 id 最小的记录；幂等，重跑无副作用）
    // （不再建 idx_users_phone_unique：全新环境由 016 出生即建 uk_phone，
    //   避免重放迁移链时出现同定义双唯一索引。）
    await dbPool.query(`
      DELETE u1 FROM crm_users u1
      INNER JOIN crm_users u2
      WHERE u1.id > u2.id
        AND u1.phone IS NOT NULL
        AND u1.phone != ''
        AND u1.phone = u2.phone
    `);
  },
};
