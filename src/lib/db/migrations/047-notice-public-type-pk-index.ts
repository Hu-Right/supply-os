/**
 * 迁移 047 — notice_public 增加 (notice_type_code, notice_pk, deadline_ts) 索引
 *
 * @module server/db/migrations/047-notice-public-type-pk-index
 * @description 2026-11-18：首页「最新 RFQ 询价」栏改为直接读服务表
 *              （不再经 Meili / unified-search），查询形态是
 *              `WHERE notice_type_code='RFQ' AND (deadline 有效) ORDER BY notice_pk DESC LIMIT 20`。
 *              没有对应索引时要在 21 万条 RFQ 行上 filesort；本索引让 MySQL 按
 *              「类型等值 → 主键倒序」走索引，deadline 过滤在索引内完成（Using index），
 *              取前 20 条即可停止。
 *
 *              只加一条二级索引（Online DDL，不锁表、不改数据）。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 47,
  name: "notice_public_type_pk_index",
  async up(dbPool: Pool): Promise<void> {
    await ensureIndex(
      dbPool,
      "notice_public",
      "idx_np_type_pk",
      "ALTER TABLE notice_public ADD INDEX idx_np_type_pk (notice_type_code, notice_pk, deadline_ts)",
    );
  },
};
