/**
 * 064: 会话满意度评价（P1）
 * chat-satisfaction
 *
 * 评价直接挂在会话上（1:1）：星级 1-5 + 可选标签 + 可选文字。
 * 仅 closed 且未评价过的会话可提交（rateSession 条件更新保证）。
 * 标签为自由文本（前端提供固定候选），存单值即可满足统计口径。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 64,
  name: "chat-satisfaction",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "satisfaction",
      "satisfaction TINYINT UNSIGNED NULL COMMENT '1-5 星' AFTER last_message_at",
    );
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "satisfaction_tag",
      "satisfaction_tag VARCHAR(190) NULL AFTER satisfaction",
    );
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "satisfaction_comment",
      "satisfaction_comment VARCHAR(500) NULL AFTER satisfaction_tag",
    );
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "rated_at",
      "rated_at DATETIME NULL AFTER satisfaction_comment",
    );
  },
};
