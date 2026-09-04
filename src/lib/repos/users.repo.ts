/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 用户数据访问层
 * Users Repository
 *
 * @module repos/users.repo
 * @description crm_users.user_key 列退役路线图（迁移 062/065/066）代码侧收尾：
 *              - 所有查询/更新一律以 id (user_id) 为主键，不再依赖 user_key 列；
 *              - SELECT 语句不再回读 user_key 列，为后续 DROP COLUMN 铺路；
 *              - create() 仍写入 user_key（列 NOT NULL UNIQUE 尚未由迁移放松），
 *                写入值取手机号，与新用户注册路径一致；DROP COLUMN 迁移落地后
 *                可同步移除 INSERT 中的 user_key 占位。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import type { UserRow } from "./types";

export class UsersRepo {
  constructor(private pool: Pool) {}

  /** 按 user_id 查找用户（仅返回登录/展示所需字段）——Token 刷新 uid 优先路径使用 */
  async findProfileById(userId: number): Promise<Partial<UserRow> | null> {
    const [rows] = await this.pool.query(
      `SELECT id, email, email_verified, phone, phone_verified, display_name, nickname, membership_tier, account_status, supplier_id, supplier_link_status
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

  /** 按手机号查找用户（登录鉴权用，含 password_hash） */
  async findAuthByPhone(phone: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, email, phone, phone_verified, display_name, nickname, password_hash, password_hash_type, email_verified,
              membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE phone = ? LIMIT 1`,
      [phone],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /**
   * 创建用户（INSERT ONLY，不覆盖已有记录），返回自增 id（0 表示失败）。
   * user_key 列仍为 NOT NULL UNIQUE（迁移 066 明确保留），写入值取手机号作为
   * 登录凭据占位；后续 DROP COLUMN 迁移落地后可同步移除该字段。
   */
  async create(data: {
    email: string | null;
    display_name: string;
    nickname?: string;
    password_hash: string;
    password_hash_type?: string;
    user_type?: string;
    phone?: string;
    referral_code?: string;
    referral_employee_id?: number;
  }): Promise<number> {
    const hashType = data.password_hash_type ?? "bcrypt";
    const userType = data.user_type ?? "enterprise";
    // user_key 占位值：手机号优先（新用户注册即登录账号），否则回退邮箱，最后回退随机串
    // 保持 UNIQUE 约束不被空串冲突；DROP COLUMN 后此逻辑整体移除
    const userKeyPlaceholder = data.phone || data.email || `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [result] = await this.pool.execute(
      `INSERT INTO crm_users (user_key, email, display_name, nickname, password_hash, password_hash_type, membership_tier, account_status, user_type, phone, referral_code, referral_employee_id)
       VALUES (?, ?, ?, ?, ?, ?, 'free', 'pending', ?, ?, ?, ?)`,
      [userKeyPlaceholder, data.email, data.display_name, data.nickname ?? null, data.password_hash, hashType, userType, data.phone ?? null, data.referral_code ?? null, data.referral_employee_id ?? null],
    );
    return Number((result as ResultSetHeader).insertId ?? 0);
  }

  /** 更新密码及哈希类型（找回密码 / 透明升级）——按 user_id */
  async updatePasswordById(userId: number, hash: string, hashType: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET password_hash = ?, password_hash_type = ?, updated_at = NOW() WHERE id = ?",
      [hash, hashType, userId],
    );
  }

  /** 标记邮箱已验证——按 user_id */
  async markEmailVerifiedById(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email_verified = 1, updated_at = NOW() WHERE id = ?",
      [userId],
    );
  }

  /** 标记手机已验证——按 user_id（注册流程 create 后立即调用） */
  async markPhoneVerifiedById(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET phone_verified = 1, updated_at = NOW() WHERE id = ?",
      [userId],
    );
  }

  /** 更新昵称（不触碰密码；nickname_source=2 标记用户自定义）——按 user_id */
  async updateProfileById(userId: number, nickname: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET nickname = ?, nickname_source = 2, updated_at = NOW() WHERE id = ?",
      [nickname, userId],
    );
  }

  /** 更新会员等级——按 user_id */
  async updateMembershipTierById(userId: number, tier: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET membership_tier = ?, updated_at = NOW() WHERE id = ?",
      [tier, userId],
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
    return (result as ResultSetHeader).affectedRows > 0;
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

  /** 按邮箱查找用户（邮箱绑定冲突检测 / 邮箱注册查重） */
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
      return this.findAuthByPhone(identifier);
    }
    // 历史邮箱用户兼容：按 email 查找
    const [rows] = await this.pool.query(
      `SELECT id, email, phone, phone_verified, display_name, nickname, password_hash, password_hash_type, email_verified,
              membership_tier, account_status, supplier_id, supplier_link_status
       FROM crm_users WHERE email = ? LIMIT 1`,
      [identifier.toLowerCase()],
    );
    return (rows as UserRow[])[0] ?? null;
  }

  /**
   * N6 收敛（2026-08-20）+ user_id 迁移 Phase 0（2026-09-03）：
   * 管理员通道更换邮箱——按 user_id 定位。换邮箱不影响任何历史数据查询。
   * 登录兼容：findByEmail / findByIdentifier 已按 email 查找，新邮箱登录直接生效。
   */
  async updateUserEmailById(userId: number, newEmail: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_users SET email = ?, email_verified = 0, updated_at = NOW() WHERE id = ?",
      [newEmail.toLowerCase(), userId],
    );
  }
}
