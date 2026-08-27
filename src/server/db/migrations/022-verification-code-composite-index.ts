/**
 * 022: 验证码表复合索引
 * verification-code-composite-index
 *
 * crm_password_resets 表的验证码查询频繁使用以下 WHERE 条件组合：
 *   WHERE user_key = ? AND code_type = ? AND used = 0 AND expires_at > NOW()
 *   ORDER BY created_at DESC LIMIT 1
 *
 * 原有 idx_code_lookup (user_key, used, expires_at) 索引未包含 code_type，
 * 导致每次查询需要额外回表过滤 code_type，数据量大时性能下降。
 * 本迁移添加覆盖全部查询条件的复合索引。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 22,
  name: "verification-code-composite-index",
  async up(dbPool: Pool) {
    // 复合索引覆盖：user_key → code_type → used → expires_at
    // 查询时按此顺序过滤，created_at 用于 ORDER BY（已包含在索引尾部）
    await ensureIndex(
      dbPool,
      "crm_password_resets",
      "idx_code_type_lookup",
      "ALTER TABLE crm_password_resets ADD INDEX idx_code_type_lookup (user_key, code_type, used, expires_at, created_at)",
    );
  },
};
