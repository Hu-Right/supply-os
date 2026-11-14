/**
 * 迁移 017 · 采购主体「重新提交」语义（F01）
 *
 * @module server/db/migrations/017-buyer-resubmit
 * @description 主体认证原本没有"提交"这个动作：`PUT /api/procurement/buyer` 只做 upsert，
 *              被核验员打回 need_info（要求补件）的用户改完资料再保存，状态原地不动、
 *              也没有提交时间——核验后台只能靠 updated_at 猜哪一版是补过的，
 *              用户侧也看不出自己那一下到底送没送到。
 *
 *              本迁移补两件：
 *              ① `submitted_at` —— 最后一次进入待核验队列的时间（unix 秒，与本表其余
 *                 时间列同为 int unsigned）。写入方只有 upsertBuyer：创建、补件重提、
 *                 身份字段变更回落三处；pending 状态下重复保存不刷新（避免把队尾刷成队首）。
 *              ② `(status, submitted_at)` 复合索引 —— 核验后台按提交时间捞队列、
 *                 算等待时长（原先只有 status 单列索引，排序仍要回表排序）。
 *
 *              状态口径（由 buyers.ts:upsertBuyer 实施，此处仅建列）：
 *              need_info → pending（补件即重提）；verified + 身份字段变更 → pending；
 *              restricted 不自动放开（人工判定"不予使用"，须人工申诉）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 17,
  name: "buyer_resubmit",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "submitted_at",
      "submitted_at int unsigned DEFAULT NULL COMMENT '最后一次进入待核验队列的时间（unix 秒）'",
    );
    await ensureIndex(
      dbPool,
      "procurement_buyers",
      "idx_buyers_queue",
      "ALTER TABLE procurement_buyers ADD INDEX idx_buyers_queue (status, submitted_at)",
    );
  },
};
