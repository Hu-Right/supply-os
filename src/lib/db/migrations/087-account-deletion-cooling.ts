/**
 * 迁移 087 · 注销冷静期与阻塞项
 *
 * @module lib/db/migrations/087-account-deletion-cooling
 * @description 对齐大厂注销流程：
 *              - 提交后进入冷静期（cooling），到期才允许执行；期间重新登录即撤销；
 *              - 提交/执行前检查「未支付订单、未完成发票」等阻塞项，写入 blockers 快照。
 *              状态取值扩展为：pending / cooling / processing / done / rejected / cancelled。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 87,
  name: "account_deletion_cooling",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "account_deletion_requests",
      "cooling_until",
      "cooling_until DATETIME NULL COMMENT '冷静期结束时间；到期前不可执行注销' AFTER status",
    );
    await ensureColumn(
      dbPool,
      "account_deletion_requests",
      "blockers",
      "blockers VARCHAR(500) NULL COMMENT '提交时阻塞项快照（未支付订单/未完成发票等），JSON 数组' AFTER cooling_until",
    );
  },
};
