/**
 * 迁移 086 · 注销结果通知水位
 *
 * @module lib/db/migrations/086-account-deletion-notified
 * @description 客服在后台执行注销/拒绝后，由门户定时任务把结果通知用户。
 *              号码/邮箱在申请单 identifier 里留有快照（执行注销后 users 已匿名化，不能反查）。
 *              notified_at 为空表示待通知；写通道便于排查（email / skipped）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 86,
  name: "account_deletion_notified",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "account_deletion_requests",
      "notified_at",
      "notified_at DATETIME NULL COMMENT '结果通知发送时间；NULL=待通知' AFTER handled_note",
    );
    await ensureColumn(
      dbPool,
      "account_deletion_requests",
      "notified_channel",
      "notified_channel VARCHAR(16) NULL COMMENT 'email / sms / skipped' AFTER notified_at",
    );
  },
};
