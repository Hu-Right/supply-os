/**
 * 014: 补齐 crm_password_resets 缺失列
 *
 * 背景：迁移 012 最初执行时 CREATE TABLE 未包含 email_sent / email_error 列，
 * 后续 012 文件虽追加了列定义和 ensureColumn，但因版本已标记为 applied 不会重跑。
 * 本迁移负责补齐缺失列，修复 "Unknown column 'email_sent' in 'field list'" 错误。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 14,
  name: "password-reset-email-columns",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "email_sent",
      "email_sent TINYINT(1) NOT NULL DEFAULT 0",
    );
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "email_error",
      "email_error VARCHAR(500) NULL",
    );
  },
};
