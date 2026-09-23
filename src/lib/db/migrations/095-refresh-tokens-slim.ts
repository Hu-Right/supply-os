/**
 * 095: crm_refresh_tokens 结构精简 + 全量清空重建（非必要不记录）
 * refresh-tokens-slim
 *
 * @description 该表经 018→062→065→066 累计后，仍残留已退役的 user_key 列
 *   （066 已放松为可空，运行期 INSERT 恒写 NULL）及其 idx_user_key 索引。
 *   本迁移将表重建为精简结构：删除退役列 user_key + idx_user_key，仅保留功能
 *   必需列（id / user_id / token_hash / expires_at / created_at）。
 *
 *   数据口径（用户 2026-09-23 确认）：刷新令牌为 7 天短命、可随重新登录再发的
 *    disposable 数据，直接全量清空重建（不留备份表），自增 id 从 1 重新开始。
 *   唯一副作用：迁移后所有在线会话的续期令牌失效，用户下次访问需重新登录一次。
 *
 *   实现方式：DROP TABLE IF EXISTS + CREATE TABLE（干净重定义），天然幂等——
 *   重跑始终得到一张自增从 1 起始的精简空表。表无被外键引用，DROP 不被阻断。
 *
 *   字符集/排序规则统一 utf8mb4 / utf8mb4_0900_ai_ci（对齐全库标准，见迁移 065）。
 *   表级 + 列级 COMMENT 齐备，与 docs/数据库设计 文档口径一致。
 *
 *   配套代码变更：auth.repo.insertRefreshToken 的 INSERT 已同步移除 user_key 列，
 *   否则删列后签发会报 Unknown column（迁移与代码必须同批上线）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 95,
  name: "refresh-tokens-slim",
  async up(dbPool: Pool) {
    // 全量清空 + 以精简结构重建（自增 id 从 1 起始）
    await dbPool.query("DROP TABLE IF EXISTS `crm_refresh_tokens`");
    await dbPool.query(`
      CREATE TABLE crm_refresh_tokens (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id     BIGINT UNSIGNED NULL COMMENT '所属用户 ID（crm_users.id）；用于按用户吊销全部会话',
        token_hash  VARCHAR(128)    NOT NULL COMMENT 'Refresh Token 的 SHA-256 哈希（不存明文，泄露不可反推）',
        expires_at  DATETIME        NOT NULL COMMENT '过期时间（与 JWT 有效期对齐，7 天）；到期由周期任务清理',
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签发时间（审计用）',
        PRIMARY KEY (id),
        INDEX idx_user_id (user_id),
        INDEX idx_token_hash (token_hash),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT='Refresh Token 哈希登记表：支撑 JWT 令牌续期、登出吊销、改密/封号即踢所有旧会话'
    `);
    console.log("[migration-095] crm_refresh_tokens 已重建为精简结构（删除退役列 user_key，自增 id 从 1 起始，历史令牌已清空）");
  },
};
