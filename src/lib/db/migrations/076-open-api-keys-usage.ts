/**
 * 076: 开放 API — Key 管理 + 用量计量
 * crm_api_keys / crm_api_usage
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 76,
  name: "open-api-keys-usage",
  async up(dbPool: Pool) {
    // API Key 管理表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_api_keys (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        key_hash CHAR(64) NOT NULL COMMENT 'API Key SHA-256 哈希（不存明文）',
        key_prefix VARCHAR(16) NOT NULL COMMENT 'Key 前缀，供调用方识别',
        name VARCHAR(100) NOT NULL COMMENT '应用名称',
        tier ENUM('basic','pro') NOT NULL DEFAULT 'basic' COMMENT '套餐档位',
        rate_limit_per_min INT NOT NULL DEFAULT 60 COMMENT '每分钟请求上限',
        daily_quota INT NOT NULL DEFAULT 1000 COMMENT '每日调用配额',
        status ENUM('active','suspended','revoked') NOT NULL DEFAULT 'active',
        expires_at DATETIME NULL DEFAULT NULL COMMENT '过期时间（NULL=永不过期）',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NULL DEFAULT NULL,
        UNIQUE KEY uk_key_hash (key_hash),
        KEY idx_status (status),
        KEY idx_prefix (key_prefix)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 用量计量表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_api_usage (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        api_key_id BIGINT UNSIGNED NOT NULL,
        endpoint VARCHAR(80) NOT NULL COMMENT '调用端点',
        tier ENUM('basic','pro') NOT NULL DEFAULT 'basic' COMMENT '消耗档位',
        response_code SMALLINT NOT NULL DEFAULT 200 COMMENT 'HTTP 响应码',
        ip_address VARCHAR(45) NULL DEFAULT NULL COMMENT '调用方 IP',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_key_date (api_key_id, created_at),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
