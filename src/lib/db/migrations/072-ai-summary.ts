/**
 * 072: AI 拆标摘要功能表
 * ai-summary
 *
 * 新增两张表：
 * - crm_user_llm_config：用户自定义 LLM API 配置（BYOK，api_key 加密存储）
 * - crm_notice_ai_summaries：AI 摘要缓存（按 user_id + notice_id 维度）
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 72,
  name: "ai-summary",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_llm_config (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        provider_name VARCHAR(100) NOT NULL DEFAULT 'Custom',
        base_url VARCHAR(500) NOT NULL,
        api_key VARCHAR(500) NOT NULL,
        model VARCHAR(100) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_active (user_id, is_active),
        KEY idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_notice_ai_summaries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        notice_id BIGINT UNSIGNED NOT NULL,
        core_deliverables TEXT NULL,
        key_qualifications TEXT NULL,
        payment_cycle TEXT NULL,
        risk_alerts TEXT NULL,
        model VARCHAR(100) NOT NULL,
        provider_base_url VARCHAR(500) NOT NULL,
        input_tokens INT UNSIGNED NULL,
        output_tokens INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_notice (user_id, notice_id),
        KEY idx_notice (notice_id),
        KEY idx_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[migration-072] AI 拆标摘要表已就绪");
  },
};
