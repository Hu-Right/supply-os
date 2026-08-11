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

  /** 按 user_key 查找用户（登录鉴权用，含 password_hash） */
  async findAuthByKey(userKey: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      `SELECT user_key, email, display_name, password_hash, password_hash_type, email_verified,
              membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE user_key = ? LIMIT 1`,
      [userKey],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 创建用户（INSERT ONLY，不覆盖已有记录） */
  async create(data: {
    user_key: string;
    email: string;
    display_name: string;
    password_hash: string;
    password_hash_type?: string;
  }): Promise<boolean> {
    const hashType = data.password_hash_type ?? "bcrypt";
    const [result] = await this.pool.execute(
      `INSERT INTO crm_users (user_key, email, display_name, password_hash, password_hash_type, membership_tier, account_status)
       VALUES (?, ?, ?, ?, ?, 'free', 'pending')`,
      [data.user_key, data.email, data.display_name, data.password_hash, hashType],
    );
    return (result as any).affectedRows > 0;
  }

  /** 更新密码及哈希类型（找回密码 / 透明升级） */
  async updatePassword(userKey: string, hash: string, hashType: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET password_hash = ?, password_hash_type = ?, updated_at = NOW() WHERE user_key = ?",
      [hash, hashType, userKey],
    );
  }

  /** 标记邮箱已验证 */
  async markEmailVerified(userKey: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email_verified = 1, updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** 更新显示名（不触碰密码） */
  async updateProfile(userKey: string, displayName: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET display_name = ?, updated_at = NOW() WHERE user_key = ?",
      [displayName, userKey],
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
