/**
 * 017: 验证码表扩展支持手机
 * phone-verification
 *
 * 为 crm_password_resets 表添加手机号相关字段，支持短信验证码发送与追踪。
 * Add phone-related columns to crm_password_resets for SMS verification.
 *
 * code_type 新增类型值（VARCHAR(20) 已足够容纳）：
 *   phone_bind   — 绑定手机号
 *   phone_rebind — 换绑手机号
 *   phone_unbind — 解绑手机号
 *   phone_reset  — 手机找回密码
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 17,
  name: "phone-verification",
  async up(dbPool: Pool) {
    // 手机号（短信验证码场景记录目标号码）
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "phone",
      "phone VARCHAR(20) NULL AFTER user_key",
    );

    // 短信发送状态
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "sms_sent",
      "sms_sent TINYINT(1) NOT NULL DEFAULT 0",
    );

    // 短信发送错误信息
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "sms_error",
      "sms_error VARCHAR(500) NULL",
    );

    // 手机号查询索引（手机找回密码场景）
    await ensureColumn(
      dbPool,
      "crm_password_resets",
      "code_type",
      "code_type VARCHAR(20) NOT NULL DEFAULT 'password_reset' AFTER code",
    );
  },
};
