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
      `SELECT user_key, email, phone, phone_verified, display_name, membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE user_key = ? LIMIT 1`,
      [userKey],
    );
    return (rows as Partial<UserRow>[])[0] ?? null;
  }

  /** 按 user_key 查找用户（登录鉴权用，含 password_hash） */
  async findAuthByKey(userKey: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      `SELECT user_key, email, phone, phone_verified, display_name, password_hash, password_hash_type, email_verified,
              membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE user_key = ? LIMIT 1`,
      [userKey],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 创建用户（INSERT ONLY，不覆盖已有记录） */
  async create(data: {
    user_key: string;
    email: string | null;
    display_name: string;
    password_hash: string;
    password_hash_type?: string;
    user_type?: string;
    phone?: string;
    referral_code?: string;
    referral_employee_id?: number;
  }): Promise<boolean> {
    const hashType = data.password_hash_type ?? "bcrypt";
    const userType = data.user_type ?? "enterprise";
    const [result] = await this.pool.execute(
      `INSERT INTO crm_users (user_key, email, display_name, password_hash, password_hash_type, membership_tier, account_status, user_type, phone, referral_code, referral_employee_id)
       VALUES (?, ?, ?, ?, ?, 'free', 'pending', ?, ?, ?, ?)`,
      [data.user_key, data.email, data.display_name, data.password_hash, hashType, userType, data.phone ?? null, data.referral_code ?? null, data.referral_employee_id ?? null],
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

  /** 绑定手机号（同时标记已验证） */
  async bindPhone(userKey: string, phone: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone = ?, phone_verified = 1, updated_at = NOW() WHERE user_key = ?",
      [phone, userKey],
    );
  }

  /**
   * 原子绑定手机号：仅当用户尚未绑定时生效（H-3 安全加固）。
   * 返回 false 表示用户已有绑定（并发/重复请求），由路由层区分冲突原因。
   */
  async bindPhoneIfUnbound(userKey: string, phone: string): Promise<boolean> {
    const [result] = await this.pool.execute(
      "UPDATE crm_users SET phone = ?, phone_verified = 1, updated_at = NOW() WHERE user_key = ? AND phone IS NULL",
      [phone, userKey],
    );
    return (result as any).affectedRows > 0;
  }

  /** 解绑手机号 */
  async unbindPhone(userKey: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone = NULL, phone_verified = 0, updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** 按手机号查找用户（换绑冲突检测） */
  async findByPhone(phone: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_users WHERE phone = ? LIMIT 1",
      [phone],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 标记手机已验证 */
  async markPhoneVerified(userKey: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone_verified = 1, updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** N6 收敛（2026-08-20）：管理员通道更换邮箱（同时更新 user_key，因为 user_key 就是小写邮箱） */
  async updateUserEmail(oldUserKey: string, newEmail: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET user_key = ?, email = ?, email_verified = 0, updated_at = NOW() WHERE user_key = ?",
      [newEmail, newEmail, oldUserKey],
    );
  }
}
