/**
 * 迁移 020 · 站内通知软删除
 *
 * @module server/db/migrations/020-notifications-soft-delete
 * @description 通知是消耗品：用户需要能清理（批量删除/全部删除）。硬删会丢掉"曾发过什么"的审计事实，
 *              也让客服无法排查"我是不是没收到"，因此用软删：`deleted_at` 非空即视为已删除，
 *              所有读路径（列表/未读/全部已读/单条）统一加 `deleted_at IS NULL`。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 20,
  name: "notifications_soft_delete",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "notifications",
      "deleted_at",
      "deleted_at datetime DEFAULT NULL COMMENT '软删时间；非空=用户已删除（读路径统一过滤）'",
    );
  },
};
