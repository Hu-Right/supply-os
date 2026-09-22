/**
 * 开放 API — 密钥校验查询与用量计量 Repository
 *
 * @module lib/repos/open-api.repo
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

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

export interface DailyUsageRow extends RowDataPacket {
  call_date: string;
  total_calls: number;
  basic_calls: number;
  pro_calls: number;
}

export class OpenApiRepo {
  constructor(private pool: Pool) {}

  /** 按 Key 哈希查找 active 的 Key 行 */
  async findByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const [rows] = await this.pool.query<ApiKeyRow[]>(
      "SELECT * FROM crm_api_keys WHERE key_hash = ? LIMIT 1",
      [keyHash],
    );
    return rows[0] ?? null;
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
