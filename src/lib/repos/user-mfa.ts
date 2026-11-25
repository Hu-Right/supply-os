/**
 * user_mfa 仓储（账号级 TOTP 两步验证）
 *
 * @module lib/repos/user-mfa
 * @description 一张小表：启用状态 / 加密密钥 / 恢复码哈希 / 防重放时间步 / 失败计数。
 *              不做多租户、不做组织级策略——只按 user_id 一行。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface UserMfaRow {
  userId: number;
  enabled: boolean;
  secret: string | null;
  pendingSecret: string | null;
  recoveryHashes: string[];
  lastTimeStep: number | null;
  failCount: number;
}

type Row = RowDataPacket & {
  user_id: number;
  enabled: number;
  secret: string | null;
  pending_secret: string | null;
  recovery_hashes: string | null;
  last_time_step: number | null;
  fail_count: number;
};

function mapRow(row: Row): UserMfaRow {
  let hashes: string[] = [];
  if (row.recovery_hashes) {
    try {
      const parsed = JSON.parse(row.recovery_hashes) as unknown;
      if (Array.isArray(parsed)) hashes = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      hashes = [];
    }
  }
  return {
    userId: Number(row.user_id),
    enabled: Number(row.enabled) === 1,
    secret: row.secret,
    pendingSecret: row.pending_secret,
    recoveryHashes: hashes,
    lastTimeStep: row.last_time_step === null ? null : Number(row.last_time_step),
    failCount: Number(row.fail_count || 0),
  };
}

export async function findUserMfa(pool: Pool, userId: number): Promise<UserMfaRow | null> {
  const [rows] = await pool.query<Row[]>(
    "SELECT user_id, enabled, secret, pending_secret, recovery_hashes, last_time_step, fail_count FROM user_mfa WHERE user_id = ?",
    [userId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** 保存绑定中的临时密钥（重新发起绑定时覆盖） */
export async function savePendingMfaSecret(pool: Pool, userId: number, encryptedSecret: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_mfa (user_id, pending_secret, enabled) VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE pending_secret = VALUES(pending_secret)`,
    [userId, encryptedSecret],
  );
}

/** 启用：pending → 正式密钥 + 恢复码哈希 */
export async function enableUserMfa(
  pool: Pool,
  userId: number,
  encryptedSecret: string,
  recoveryHashes: string[],
): Promise<void> {
  await pool.query(
    `INSERT INTO user_mfa (user_id, secret, pending_secret, enabled, recovery_hashes, fail_count)
     VALUES (?, ?, NULL, 1, ?, 0)
     ON DUPLICATE KEY UPDATE secret = VALUES(secret), pending_secret = NULL, enabled = 1,
       recovery_hashes = VALUES(recovery_hashes), fail_count = 0`,
    [userId, encryptedSecret, JSON.stringify(recoveryHashes)],
  );
}

/** 关闭：清空整行（含恢复码与密钥） */
export async function disableUserMfa(pool: Pool, userId: number): Promise<void> {
  await pool.query("DELETE FROM user_mfa WHERE user_id = ?", [userId]);
}

/** 记录成功使用的时间步（防同一动态码重放） */
export async function markMfaTimeStepUsed(pool: Pool, userId: number, timeStep: number): Promise<void> {
  await pool.query(
    "UPDATE user_mfa SET last_time_step = ?, fail_count = 0 WHERE user_id = ?",
    [timeStep, userId],
  );
}

/** 更新恢复码哈希（使用一枚后从数组中移除） */
export async function updateMfaRecoveryHashes(pool: Pool, userId: number, hashes: string[]): Promise<void> {
  await pool.query("UPDATE user_mfa SET recovery_hashes = ? WHERE user_id = ?", [JSON.stringify(hashes), userId]);
}

/** 失败计数 +1（限流/审计用） */
export async function incrementMfaFailCount(pool: Pool, userId: number): Promise<void> {
  await pool.query("UPDATE user_mfa SET fail_count = fail_count + 1 WHERE user_id = ?", [userId]);
}
