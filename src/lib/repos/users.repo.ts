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
      `SELECT user_key, email, email_verified, phone, phone_verified, display_name, nickname, membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE user_key = ? LIMIT 1`,
      [userKey],
    );
    return (rows as Partial<UserRow>[])[0] ?? null;
  }

  /** 按 user_id 查找用户（仅返回登录/展示所需字段）——Token 刷新 uid 优先路径使用 */
  async findProfileById(userId: number): Promise<Partial<UserRow> | null> {
    const [rows] = await this.pool.query(
      `SELECT id, user_key, email, email_verified, phone, phone_verified, display_name, nickname, membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE id = ? LIMIT 1`,
      [userId],
    );
    return (rows as Partial<UserRow>[])[0] ?? null;
  }

  /** 按 user_id 查找用户（完整行，含 phone/email 等；供已认证路由使用） */
  async findById(userId: number): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_users WHERE id = ? LIMIT 1",
      [userId],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 按 user_key 查找用户（登录鉴权用，含 password_hash） */
  async findAuthByKey(userKey: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      `SELECT user_key, email, phone, phone_verified, display_name, nickname, password_hash, password_hash_type, email_verified,
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
    nickname?: string;
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
      `INSERT INTO crm_users (user_key, email, display_name, nickname, password_hash, password_hash_type, membership_tier, account_status, user_type, phone, referral_code, referral_employee_id)
       VALUES (?, ?, ?, ?, ?, ?, 'free', 'pending', ?, ?, ?, ?)`,
      [data.user_key, data.email, data.display_name, data.nickname ?? null, data.password_hash, hashType, userType, data.phone ?? null, data.referral_code ?? null, data.referral_employee_id ?? null],
    );
    return (result as any).affectedRows > 0;
  }

  /** 更新密码及哈希类型（找回密码 / 透明升级）——按 user_id */
  async updatePasswordById(userId: number, hash: string, hashType: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET password_hash = ?, password_hash_type = ?, updated_at = NOW() WHERE id = ?",
      [hash, hashType, userId],
    );
  }

  /** 更新密码及哈希类型（找回密码 / 透明升级） */
  async updatePassword(userKey: string, hash: string, hashType: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET password_hash = ?, password_hash_type = ?, updated_at = NOW() WHERE user_key = ?",
      [hash, hashType, userKey],
    );
  }

  /** 标记邮箱已验证——按 user_id */
  async markEmailVerifiedById(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email_verified = 1, updated_at = NOW() WHERE id = ?",
      [userId],
    );
  }

  /** 标记邮箱已验证 */
  async markEmailVerified(userKey: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email_verified = 1, updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** 更新昵称（不触碰密码；nickname_source=2 标记用户自定义）——按 user_id */
  async updateProfileById(userId: number, nickname: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET nickname = ?, nickname_source = 2, updated_at = NOW() WHERE id = ?",
      [nickname, userId],
    );
  }

  /** 更新昵称（不触碰密码；nickname_source=2 标记用户自定义，回填脚本以 source=1 补齐） */
  async updateProfile(userKey: string, nickname: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET nickname = ?, nickname_source = 2, updated_at = NOW() WHERE user_key = ?",
      [nickname, userKey],
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

  /** 绑定邮箱（同时标记已验证） */
  async bindEmail(userKey: string, email: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = ?, email_verified = 1, updated_at = NOW() WHERE user_key = ?",
      [email.toLowerCase(), userKey],
    );
  }

  /** 解绑邮箱 */
  async unbindEmail(userKey: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = NULL, email_verified = 0, updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** 绑定手机号（同时标记已验证）——按 user_id */
  async bindPhoneById(userId: number, phone: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone = ?, phone_verified = 1, updated_at = NOW() WHERE id = ?",
      [phone, userId],
    );
  }

  /**
   * 原子绑定手机号：仅当用户尚未绑定时生效（H-3 安全加固）——按 user_id。
   * 返回 false 表示用户已有绑定（并发/重复请求），由路由层区分冲突原因。
   */
  async bindPhoneIfUnboundById(userId: number, phone: string): Promise<boolean> {
    const [result] = await this.pool.execute(
      "UPDATE crm_users SET phone = ?, phone_verified = 1, updated_at = NOW() WHERE id = ? AND phone IS NULL",
      [phone, userId],
    );
    return (result as any).affectedRows > 0;
  }

  /** 解绑手机号——按 user_id */
  async unbindPhoneById(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone = NULL, phone_verified = 0, updated_at = NOW() WHERE id = ?",
      [userId],
    );
  }

  /** 绑定邮箱（同时标记已验证）——按 user_id */
  async bindEmailById(userId: number, email: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = ?, email_verified = 1, updated_at = NOW() WHERE id = ?",
      [email.toLowerCase(), userId],
    );
  }

  /** 解绑邮箱——按 user_id */
  async unbindEmailById(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = NULL, email_verified = 0, updated_at = NOW() WHERE id = ?",
      [userId],
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

  /** 按邮箱查找用户（邮箱绑定冲突检测） */
  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_users WHERE email = ? LIMIT 1",
      [email.toLowerCase()],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 按手机号或邮箱查找用户（登录/找回密码统一入口） */
  async findByIdentifier(identifier: string): Promise<UserRow | null> {
    const isPhone = /^1[3-9]\d{9}$/.test(identifier);
    if (isPhone) {
      return this.findByPhone(identifier);
    }
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_users WHERE email = ? LIMIT 1",
      [identifier.toLowerCase()],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /** 按手机号或邮箱查找用户（登录鉴权专用，含 password_hash）
   *  登录已限制为仅手机号，此处保留邮箱查找以兼容历史数据 */
  async findAuthByIdentifier(identifier: string): Promise<UserRow | null> {
    const isPhone = /^1[3-9]\d{9}$/.test(identifier);
    if (isPhone) {
      return this.findAuthByKey(identifier);
    }
    // 历史邮箱用户兼容：按 email 查找
    const [rows] = await this.pool.query(
      `SELECT user_key, email, phone, phone_verified, display_name, nickname, password_hash, password_hash_type, email_verified,
              membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE email = ? LIMIT 1`,
      [identifier.toLowerCase()],
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

  /**
   * N6 收敛（2026-08-20）+ user_id 迁移 Phase 0（2026-09-03）：
   * 管理员通道更换邮箱。不再修改 user_key——user_key 退役为仅 crm_users 本表的登录凭据，
   * 业务表全部以 user_id（crm_users.id）关联。换邮箱不影响任何历史数据查询。
   * 登录兼容：findByEmail / findByIdentifier 已按 email 查找，新邮箱登录无需 user_key 同步。
   */
  async updateUserEmail(oldUserKey: string, newEmail: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = ?, email_verified = 0, updated_at = NOW() WHERE user_key = ?",
      [newEmail, oldUserKey],
    );
  }
}
