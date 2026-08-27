/**
 * 018: JWT 认证基础设施 — refresh_tokens 表
 * jwt-auth
 *
 * 新建 crm_refresh_tokens 表，用于存储 Refresh Token 哈希，
 * 支持 Token 刷新与主动失效（登出时删除）。
 *
 * 字段说明：
 *   user_key     — 所属用户
 *   token_hash   — Refresh Token 的 SHA-256 哈希（不存明文）
 *   expires_at   — Token 过期时间（与 JWT 有效期对齐，7 天）
 *   created_at   — 创建时间（用于审计）
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 18,
  name: "jwt-auth",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_refresh_tokens (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key     VARCHAR(255)    NOT NULL,
        token_hash   VARCHAR(128)    NOT NULL,
        expires_at   DATETIME        NOT NULL,
        created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_key (user_key),
        INDEX idx_token_hash (token_hash),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
