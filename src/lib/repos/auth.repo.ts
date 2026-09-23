/**
 * 认证数据访问层（验证码 + Refresh Token）
 * Auth Repository (verification codes + refresh tokens)
 *
 * @module repos/auth.repo
 * @description #6（2026-08-20）：原散落在 routes/auth/* 路由内的裸 SQL 统一下沉至此。
 *              - crm_password_resets：注册/找回/手机绑定验证码的创建、查询、核销、重试计数
 *              - crm_refresh_tokens：Refresh Token 的入库、按哈希查询/撤销、过期清理
 *              SQL 文本与原路由实现逐字等价（行为等价迁移，零逻辑变更）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

/** 验证码记录行（查询口径：id/哈希码/过期时间/已尝试次数） */
export interface AuthCodeRow {
  id: number;
  code: string;
  expires_at: Date;
  attempts: number;
}

export class AuthRepo {
  constructor(private pool: Pool) {}

  // ── crm_password_resets：验证码生命周期 ────────────────────────────────────

  /** 失效某用户某类型下所有未使用的验证码（M-3：发新码前作废旧码）
   *  仅登录态场景使用（发码时已知 user_id）；注册场景以 phone 为锚点，不走此路径。 */
  async invalidateUnusedCodes(userId: number, codeType: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE user_id = ? AND code_type = ? AND used = 0",
      [userId, codeType],
    );
  }

  /** 创建验证码记录，返回自增 id（phone 仅手机渠道传入；user_key 列已退役） */
  async createResetCode(params: {
    userId?: number | null;
    codeHash: string;
    codeType: string;
    expiresAt: Date;
    ip: string;
    phone?: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_password_resets (user_id, phone, code, code_type, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [params.userId ?? null, params.phone ?? null, params.codeHash, params.codeType, params.expiresAt, params.ip],
    );
    return (result as ResultSetHeader).insertId;
  }

  /** 查询最新一条有效（未使用且未过期）验证码（按 user_id 锚点）；phone 非空时附加手机号匹配 */
  async findLatestActiveCode(
    userId: number,
    codeType: string,
    phone?: string,
  ): Promise<AuthCodeRow | null> {
    const sql = `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_id = ? AND ${phone ? "phone = ? AND " : ""}code_type = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`;
    const args = phone ? [userId, phone, codeType] : [userId, codeType];
    const [rows] = await this.pool.query(sql, args);
    return (rows as AuthCodeRow[])[0] ?? null;
  }

  /**
   * 注册场景：以「手机号」为唯一锚点查最新有效验证码。
   * 注册时账号尚不存在，验证码天然应锚定在投递目标（手机号）上，
   * user_key / user_id 均不参与查询（user_id 待注册成功后回填）。
   */
  async findLatestActiveCodeByPhone(
    phone: string,
    codeType: string,
  ): Promise<AuthCodeRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE phone = ? AND code_type = ? AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
      [phone, codeType],
    );
    return (rows as AuthCodeRow[])[0] ?? null;
  }

  /**
   * 注册成功后回填验证码行的 user_id，建立「码 ↔ 账号」审计关联。
   * 未注册（验证码未被成功核销）则不调用，该行 user_id 保持 NULL。
   */
  async backfillCodeUserId(resetId: number, userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_password_resets SET user_id = ? WHERE id = ?",
      [userId, resetId],
    );
  }

  /** 查询验证码记录绑定的手机号（短信重置渠道的身份一致性校验用） */
  async findCodePhone(resetId: number): Promise<string | null> {
    const [rows] = await this.pool.query(
      "SELECT phone FROM crm_password_resets WHERE id = ? AND phone IS NOT NULL LIMIT 1",
      [resetId],
    );
    return ((rows as RowDataPacket[])[0]?.phone as string) ?? null;
  }

  /** 验证失败时累加尝试次数（达到上限后由路由层拒绝） */
  async incrementCodeAttempts(resetId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
      [resetId],
    );
  }

  /** 核销验证码（验证通过后标记已使用） */
  async markCodeUsed(resetId: number): Promise<void> {
    await this.pool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [resetId]);
  }

  /** 记录邮件发送结果（成功置 1；失败置 0 并记录错误信息） */
  async markEmailSent(resetId: number, sent: boolean, errorMsg?: string): Promise<void> {
    if (sent) {
      await this.pool.execute("UPDATE crm_password_resets SET email_sent = 1 WHERE id = ?", [resetId]);
    } else {
      await this.pool.execute(
        "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
        [errorMsg ?? "", resetId],
      );
    }
  }

  /** 记录短信发送结果（成功置 1；失败置 0 并记录错误信息） */
  async markSmsSent(resetId: number, sent: boolean, errorMsg?: string): Promise<void> {
    if (sent) {
      await this.pool.execute("UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?", [resetId]);
    } else {
      await this.pool.execute(
        "UPDATE crm_password_resets SET sms_sent = 0, sms_error = ? WHERE id = ?",
        [errorMsg ?? "", resetId],
      );
    }
  }

  // ── crm_refresh_tokens：Refresh Token 生命周期 ─────────────────────────────

  /** 入库新签发的 Refresh Token 哈希（纯 user_id 路径；user_key 退役列已于迁移 095 DROP） */
  async insertRefreshToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [userId, tokenHash, expiresAt],
    );
  }

  /** 按哈希查询有效（未过期）Refresh Token 归属（仅返回 id + user_id） */
  async findRefreshTokenByHash(tokenHash: string): Promise<{ id: number; user_id: number | null } | null> {
    const [rows] = await this.pool.query(
      "SELECT id, user_id FROM crm_refresh_tokens WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
      [tokenHash],
    );
    return ((rows as RowDataPacket[])[0] as { id: number; user_id: number | null }) ?? null;
  }

  /** 按哈希撤销单个 Refresh Token（轮换/登出）；返回受影响行数供原子轮换判定 */
  async deleteRefreshTokenByHash(tokenHash: string): Promise<number> {
    const [result] = await this.pool.execute(
      "DELETE FROM crm_refresh_tokens WHERE token_hash = ?",
      [tokenHash],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  /** 撤销某用户全部 Refresh Token（H-1：密码重置后强制重新登录）——纯 user_id */
  async deleteRefreshTokensByUser(userId: number): Promise<void> {
    await this.pool.execute("DELETE FROM crm_refresh_tokens WHERE user_id = ?", [userId]);
  }

  /** 清理全部过期 Refresh Token（由 auth.routes 定时器周期调用） */
  async deleteExpiredRefreshTokens(): Promise<void> {
    await this.pool.execute("DELETE FROM crm_refresh_tokens WHERE expires_at < NOW()");
  }


  // ── crm_consent_log：协议同意审计日志（P0 合规） ─────────────────────────────

  /**
   * 记录用户协议同意日志（纯 user_id 路径，user_key 列写 NULL）
   * 对应表 crm_consent_log（需提前建表，见 docs/04 技术需求清单第四节）
   */
  async recordConsentLog(params: {
    userId: number;
    consentType: string;   // terms / privacy / marketing / cookie
    documentVersion: string;
    action: string;        // agree / withdraw / re-agree
    timestamp: string;     // ISO 8601
    ipAddress: string;
    userAgent: string;
    sourcePage: string;    // register / checkout / profile
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_consent_log
        (user_id, user_key, consent_type, document_version, action, consent_timestamp, ip_address, user_agent, source_page)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.consentType,
        params.documentVersion,
        params.action,
        params.timestamp,
        params.ipAddress,
        params.userAgent,
        params.sourcePage,
      ],
    );
  }
}
