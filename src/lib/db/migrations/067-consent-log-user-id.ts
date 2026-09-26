/**
 * 067: crm_consent_log 补 user_id 列（协议同意日志纳入 user_id 内部化）
 * consent-log-user-id
 *
 * 〇.5 审计遗留项：crm_consent_log 建表时仅有 user_key（066 已 NULL 化），
 * 本迁移补 user_id 列 + 索引，使同意日志可按内部标识关联/清理。
 * 回填由 backfills.ts → backfillUserIds()（crm_consent_log 已入清单）完成。
 *
 * 守卫（2026-09-26）：本表长期**没有建表迁移**（出生结构直至 099 才补上），而旧写法
 * ensureColumn 只查列不查表——全新环境重放到本迁移会对不存在的表 ALTER，直接
 * ER_NO_SUCH_TABLE 中断启动。改走 *IfTableExists 变体：表不存在则整条跳过，
 * 终态结构由 099 的 CREATE TABLE 直接给出（已含 user_id 列与索引）。
 * 已部署环境表存在且无 user_id 列时，行为与原来逐字等价。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumnIfTableExists, ensureIndexIfTableExists, type Migration } from "./runner";

export const migration: Migration = {
  version: 67,
  name: "consent-log-user-id",
  async up(dbPool: Pool) {
    await ensureColumnIfTableExists(
      dbPool,
      "crm_consent_log",
      "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id"
    );
    await ensureIndexIfTableExists(
      dbPool,
      "crm_consent_log",
      "idx_consent_log_user_id",
      "CREATE INDEX idx_consent_log_user_id ON crm_consent_log (user_id)"
    );
  },
};
