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

  /** 失效某用户某类型下所有未使用的验证码（M-3：发新码前作废旧码） */
  async invalidateUnusedCodes(userIdOrKey: number | string, codeType: string): Promise<void> {
    if (typeof userIdOrKey === "number") {
      await this.pool.execute(
        "UPDATE crm_password_resets SET used = 1 WHERE user_id = ? AND code_type = ? AND used = 0",
        [userIdOrKey, codeType],
      );
    } else {
      // 注册场景：用户尚未创建，按 user_key 失效
      await this.pool.execute(
        "UPDATE crm_password_resets SET used = 1 WHERE user_key = ? AND code_type = ? AND used = 0",
        [userIdOrKey, codeType],
      );
    }
  }

  /** 创建验证码记录，返回自增 id（phone 仅手机渠道传入） */
  async createResetCode(params: {
    userId?: number | null;
    userKey?: string;
    codeHash: string;
    codeType: string;
    expiresAt: Date;
    ip: string;
    phone?: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_password_resets (user_id, user_key, phone, code, code_type, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [params.userId ?? null, params.userKey ?? null, params.phone ?? null, params.codeHash, params.codeType, params.expiresAt, params.ip],
    );
    return (result as ResultSetHeader).insertId;
  }

  /** 查询最新一条有效（未使用且未过期）验证码；phone 非空时附加手机号匹配 */
  async findLatestActiveCode(
    userIdOrKey: number | string,
    codeType: string,
    phone?: string,
  ): Promise<AuthCodeRow | null> {
    const isUserId = typeof userIdOrKey === "number";
    const sql = `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE ${isUserId ? "user_id" : "user_key"} = ? AND ${phone ? "phone = ? AND " : ""}code_type = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`;
    const args = phone ? [userIdOrKey, phone, codeType] : [userIdOrKey, codeType];
    const [rows] = await this.pool.query(sql, args);
    return (rows as AuthCodeRow[])[0] ?? null;
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

  /** 入库新签发的 Refresh Token 哈希 */
  async insertRefreshToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_refresh_tokens (user_id, user_key, token_hash, expires_at) VALUES (?, NULL, ?, ?)",
      [userId, tokenHash, expiresAt],
    );
  }

  /** 按哈希查询有效（未过期）Refresh Token 归属 */
  async findRefreshTokenByHash(tokenHash: string): Promise<{ id: number; user_key: string } | null> {
    const [rows] = await this.pool.query(
      "SELECT id, user_key FROM crm_refresh_tokens WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
      [tokenHash],
    );
    return ((rows as RowDataPacket[])[0] as { id: number; user_key: string }) ?? null;
  }

  /** 按哈希撤销单个 Refresh Token（轮换/登出）；返回受影响行数供原子轮换判定 */
  async deleteRefreshTokenByHash(tokenHash: string): Promise<number> {
    const [result] = await this.pool.execute(
      "DELETE FROM crm_refresh_tokens WHERE token_hash = ?",
      [tokenHash],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  /** 撤销某用户全部 Refresh Token（H-1：密码重置后强制重新登录） */
  async deleteRefreshTokensByUser(userId: number): Promise<void> {
    await this.pool.execute("DELETE FROM crm_refresh_tokens WHERE user_id = ?", [userId]);
  }

  /** 清理全部过期 Refresh Token（由 auth.routes 定时器周期调用） */
  async deleteExpiredRefreshTokens(): Promise<void> {
    await this.pool.execute("DELETE FROM crm_refresh_tokens WHERE expires_at < NOW()");
  }

  /** N6 收敛（2026-08-20）：管理员查询邮件发送记录 */
  async listPasswordResets(options: { failedOnly: boolean; limit: number }): Promise<RowDataPacket[]> {
    let sql = `
      SELECT id, user_key, code, expires_at, used, attempts, email_sent, email_error, ip, created_at
      FROM crm_password_resets
    `;
    if (options.failedOnly) {
      sql += " WHERE email_sent = 0 AND email_error IS NOT NULL";
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    const [rows] = await this.pool.query(sql, [options.limit]);
    return rows as RowDataPacket[];
  }

  // ── crm_consent_log：协议同意审计日志（P0 合规） ─────────────────────────────

  /**
   * 记录用户协议同意日志
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
        (user_id, consent_type, document_version, action, consent_timestamp, ip_address, user_agent, source_page)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
