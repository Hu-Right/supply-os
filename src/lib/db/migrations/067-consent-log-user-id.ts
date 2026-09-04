/**
 * 067: crm_consent_log 补 user_id 列（协议同意日志纳入 user_id 内部化）
 * consent-log-user-id
 *
 * 〇.5 审计遗留项：crm_consent_log 建表时仅有 user_key（066 已 NULL 化），
 * 本迁移补 user_id 列 + 索引，使同意日志可按内部标识关联/清理。
 * 回填由 backfills.ts → backfillUserIds()（crm_consent_log 已入清单）完成。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 67,
  name: "consent-log-user-id",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_consent_log",
      "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id"
    );
    await ensureIndex(
      dbPool,
      "crm_consent_log",
      "idx_consent_log_user_id",
      "CREATE INDEX idx_consent_log_user_id ON crm_consent_log (user_id)"
    );
  },
};
