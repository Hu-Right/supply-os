/**
 * 用户 LLM 配置数据访问层
 * @module lib/repos/llm-config.repo
 * @description 操作 crm_user_llm_config 表。api_key 存取均为加密串，
 *              加解密由 service 层负责（repo 不接触明文）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface LlmConfigRow extends RowDataPacket {
  id: number;
  user_id: number;
  provider_name: string;
  base_url: string;
  api_key: string; // 加密串
  model: string;
  is_active: number;
}

export class LlmConfigRepo {
  constructor(private pool: Pool) {}

  /** 获取用户当前活跃配置（无则 null） */
  async findActiveByUser(userId: number): Promise<LlmConfigRow | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM crm_user_llm_config WHERE user_id = ? AND is_active = 1 LIMIT 1",
      [userId],
    );
    return (rows as LlmConfigRow[])[0] ?? null;
  }

  /** UPSERT 用户配置（api_key 为加密串） */
  async upsert(
    userId: number,
    providerName: string,
    baseUrl: string,
    encryptedKey: string,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_user_llm_config (user_id, provider_name, base_url, api_key, model, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         provider_name = VALUES(provider_name),
         base_url = VALUES(base_url),
         api_key = VALUES(api_key),
         model = VALUES(model),
         is_active = 1`,
      [userId, providerName, baseUrl, encryptedKey, model],
    );
  }
}
