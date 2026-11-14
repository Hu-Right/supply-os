/**
 * 迁移 021 · 授权书核验回调幂等键
 *
 * @module server/db/migrations/021-authorization-callback
 * @description 2026-11：把"后台审核类"事件统一收进通知模块。授权书核验此前是
 *              ADR 记的例外——站外评审后台**直写库**，门户没有端点，因此也发不出通知，
 *              采购方签完字后完全被动（只能在发布页反复刷新）。
 *
 *              本迁移给核验回调铺幂等：`callback_id`（调用方 X-Review-Request-Id）+ 
 *              唯一键 `(project_id, version_no, callback_id)`，重复投递不重复改状态、
 *              不重复发通知。NULL 行不受唯一约束（历史直写的数据保持可用）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureColumnType, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 21,
  name: "authorization_callback",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_authorizations",
      "callback_id",
      "callback_id varchar(64) DEFAULT NULL COMMENT '核验回调幂等键（X-Review-Request-Id）；NULL=历史直写数据'",
    );
    await ensureIndex(
      dbPool,
      "procurement_authorizations",
      "uq_pauth_callback",
      "ALTER TABLE procurement_authorizations ADD UNIQUE KEY uq_pauth_callback (project_id, version_no, callback_id)",
    );
    // 通知类型码加宽：`procurement.authorization_verified` 有 36 字符，原来的 varchar(32)
    // 会把它静默截断成 `…_verifi`（前端渲染器按 type 匹配文案，截断后必然匹配不到 → 回落空文案）。
    await ensureColumnType(
      dbPool,
      "notifications",
      "type",
      "type varchar(48) NOT NULL COMMENT '类型：procurement.* / buyer.* / 系统广播'",
    );
  },
};

