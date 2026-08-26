/**
 * 021: 验证码哈希列扩容
 * verification-code-hash-column
 *
 * crm_password_resets.code 原始定义为 VARCHAR(10)，仅能存放明文验证码。
 * 后续安全加固改为存储 SHA-256 哈希（64 字符），但未同步迁移列定义，
 * 导致 INSERT 时报 "Data too long for column 'code'"。
 * 本迁移将 code 列扩容至 VARCHAR(128) 以容纳哈希值。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumnType, type Migration } from "./runner";

export const migration: Migration = {
  version: 21,
  name: "verification-code-hash-column",
  async up(dbPool: Pool) {
    await ensureColumnType(
      dbPool,
      "crm_password_resets",
      "code",
      "code VARCHAR(128) NOT NULL",
    );
  },
};
