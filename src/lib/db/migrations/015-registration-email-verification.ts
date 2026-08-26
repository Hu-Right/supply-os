/**
 * 015: 注册邮箱验证
 * registration-email-verification
 *
 * 为 crm_password_resets 表添加 code_type 字段，区分注册验证码和找回密码验证码。
 * 注册流程改为：先发送验证码到邮箱 → 用户输入验证码 → 验证通过后创建账户。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 15,
  name: "registration-email-verification",
  async up(dbPool: Pool) {
    // 验证码类型：password_reset（找回密码）/ registration（注册验证）
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "code_type",
      "code_type VARCHAR(20) NOT NULL DEFAULT 'password_reset' AFTER code",
    );
  },
};
