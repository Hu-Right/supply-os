/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 用户数据访问层
 * Users Repository
 *
 * @module repos/users.repo
 */
import type { Pool } from "mysql2/promise";
import type { UserRow } from "./types";

export class UsersRepo {
  constructor(private pool: Pool) {}

  /** 按 user_key 查找用户 */
  async findByKey(userKey: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_users WHERE user_key = ? LIMIT 1",
      [userKey],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 按 user_key 查找用户（仅返回登录/展示所需字段） */
  async findProfileByKey(userKey: string): Promise<Partial<UserRow> | null> {
    const [rows] = await this.pool.query(
      `SELECT user_key, email, display_name, membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE user_key = ? LIMIT 1`,
      [userKey],
    );
    return (rows as Partial<UserRow>[])[0] ?? null;
  }

  /** 创建或更新用户（UPSERT） */
  async upsert(data: {
    user_key: string;
    email: string;
    display_name: string;
    password_hash: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_users (user_key, email, display_name, password_hash, membership_tier, account_status)
       VALUES (?, ?, ?, ?, 'free', 'pending')
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), updated_at = NOW()`,
      [data.user_key, data.email, data.display_name, data.password_hash],
    );
  }

  /** 更新会员等级 */
  async updateMembershipTier(userKey: string, tier: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET membership_tier = ?, updated_at = NOW() WHERE user_key = ?",
      [tier, userKey],
    );
  }
}
