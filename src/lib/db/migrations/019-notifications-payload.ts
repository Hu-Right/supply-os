/**
 * 迁移 019 · 站内通知：结构化参数 + 事件幂等键
 *
 * @module server/db/migrations/019-notifications-payload
 * @description 2026-11 审计：`notifications` 表建好了、API 与顶栏铃铛都有，但
 *              **`pushNotification` 全库零调用** —— 迁移 003 注释里说的"RFQ 闭环触达"
 *              随 RFQ v2 退役一起消失，铃铛成了永远空的壳。要接业务事件，先补两件事：
 *
 *              ① `payload` —— 通知标题/正文不再由后端拼中文（那样 7 语言 i18n 当场破功，
 *                 且文案必须带需求编号/截止时间等参数）。改存 `type` + 参数 JSON，
 *                 前端按 type 渲染 `t()`；`title`/`body` 保留为兜底快照（类型未知或旧数据显示）。
 *              ② `dedupe_key` + 唯一键 —— 回调会重试（超时、后台重发），同一事件不能重复发。
 *                 键形如 `procurement.published:123:v2`；NULL 表示不参与去重（系统广播类）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 19,
  name: "notifications_payload",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "notifications",
      "payload",
      "payload json DEFAULT NULL COMMENT '通知参数（前端按 type 渲染 i18n 文案）'",
    );
    await ensureColumn(
      dbPool,
      "notifications",
      "dedupe_key",
      "dedupe_key varchar(96) DEFAULT NULL COMMENT '事件幂等键（如 procurement.published:123:v2）；NULL=不参与去重'",
    );
    await ensureIndex(
      dbPool,
      "notifications",
      "uq_notif_dedupe",
      "ALTER TABLE notifications ADD UNIQUE KEY uq_notif_dedupe (dedupe_key)",
    );
  },
};
