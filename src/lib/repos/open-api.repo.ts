/**
 * 开放 API — Key 管理 + 用量计量 Repository
 * Open API — API Key management and usage tracking repository
 *
 * @module lib/repos/open-api.repo
 */
import "server-only";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { createHash, randomBytes } from "crypto";

export type ApiKeyTier = "basic" | "pro";
export type ApiKeyStatus = "active" | "suspended" | "revoked";

export interface ApiKeyRow extends RowDataPacket {
  id: number;
  key_hash: string;
  key_prefix: string;
  name: string;
  tier: ApiKeyTier;
  rate_limit_per_min: number;
  daily_quota: number;
  status: ApiKeyStatus;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyCreateResult {
  id: number;
  key_prefix: string;
  /** 明文 Key — 仅创建时返回一次，调用方须自行保管 */
  plaintext_key: string;
}

export interface DailyUsageRow extends RowDataPacket {
  call_date: string;
  total_calls: number;
  basic_calls: number;
  pro_calls: number;
}

/** 对明文 Key 做 SHA-256 哈希 */
function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export class OpenApiRepo {
  constructor(private pool: Pool) {}

  // ── Key 管理 ──────────────────────────────────────────────────────

  /** 创建 API Key，返回明文（仅此一次） */
  async createKey(name: string, tier: ApiKeyTier, dailyQuota: number, rateLimitPerMin: number, expiresAt?: string): Promise<ApiKeyCreateResult> {
    const plaintext = `supplyos_sk_${randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(plaintext);
    const keyPrefix = plaintext.slice(0, 16);

    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO crm_api_keys (key_hash, key_prefix, name, tier, rate_limit_per_min, daily_quota, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ${expiresAt ? "?" : "NULL"})`,
      expiresAt
        ? [keyHash, keyPrefix, name, tier, rateLimitPerMin, dailyQuota, expiresAt]
        : [keyHash, keyPrefix, name, tier, rateLimitPerMin, dailyQuota],
    );

    return { id: result.insertId, key_prefix: keyPrefix, plaintext_key: plaintext };
  }

  /** 按 Key 哈希查找 active 的 Key 行 */
  async findByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const [rows] = await this.pool.query<ApiKeyRow[]>(
      "SELECT * FROM crm_api_keys WHERE key_hash = ? LIMIT 1",
      [keyHash],
    );
    return rows[0] ?? null;
  }

  /** 列出所有 Key（管理后台用，不返回 hash） */
  async listKeys(): Promise<ApiKeyRow[]> {
    const [rows] = await this.pool.query<ApiKeyRow[]>(
      "SELECT id, key_prefix, name, tier, rate_limit_per_min, daily_quota, status, expires_at, created_at, last_used_at FROM crm_api_keys ORDER BY id DESC",
    );
    return rows;
  }

  /** 更新 Key 状态 */
  async updateKeyStatus(keyId: number, status: ApiKeyStatus): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      "UPDATE crm_api_keys SET status = ? WHERE id = ?",
      [status, keyId],
    );
    return result.affectedRows > 0;
  }

  /** 更新 Key 的 tier 和配额 */
  async updateKeyConfig(keyId: number, tier: ApiKeyTier, dailyQuota: number, rateLimitPerMin: number): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      "UPDATE crm_api_keys SET tier = ?, daily_quota = ?, rate_limit_per_min = ? WHERE id = ?",
      [tier, dailyQuota, rateLimitPerMin, keyId],
    );
    return result.affectedRows > 0;
  }

  /** 更新最后使用时间 */
  async touchLastUsed(keyId: number): Promise<void> {
    await this.pool.query("UPDATE crm_api_keys SET last_used_at = NOW() WHERE id = ?", [keyId]);
  }

  // ── 用量计量 ──────────────────────────────────────────────────────

  /** 记录一次 API 调用 */
  async recordUsage(apiKeyId: number, endpoint: string, tier: ApiKeyTier, responseCode: number, ip: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO crm_api_usage (api_key_id, endpoint, tier, response_code, ip_address) VALUES (?, ?, ?, ?, ?)",
      [apiKeyId, endpoint, tier, responseCode, ip],
    );
  }

  /** 查询某 Key 今日调用次数 */
  async getTodayUsage(apiKeyId: number): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM crm_api_usage WHERE api_key_id = ? AND DATE(created_at) = CURDATE()",
      [apiKeyId],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 查询某 Key 最近 N 天的每日用量汇总 */
  async getDailyUsage(apiKeyId: number, days: number = 30): Promise<DailyUsageRow[]> {
    const [rows] = await this.pool.query<DailyUsageRow[]>(
      `SELECT DATE(created_at) AS call_date,
              COUNT(*) AS total_calls,
              SUM(tier = 'basic') AS basic_calls,
              SUM(tier = 'pro') AS pro_calls
       FROM crm_api_usage
       WHERE api_key_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY call_date DESC`,
      [apiKeyId, days],
    );
    return rows;
  }
}
