/**
 * 迁移 045 — notice_public 增加 is_opportunity 复合索引（精选/商机集合统计走服务表）
 *
 * @module server/db/migrations/045-notice-public-opportunity-index
 * @description 2026-11-18：统计接口的「精选」指标改读服务表 notice_public.is_opportunity
 *              （该列注释即「1=is_featured 或关联合格/在架/过审商机」，与首页热门商机
 *              featured=1 的检索口径同源）。此前 notice_public 没有 is_opportunity 索引，
 *              带截止谓词的 COUNT 实测 15.6s（type=ALL 全表扫 53 万行）。
 *
 *              本迁移只加一条二级索引（is_opportunity 等值 + deadline_ts 范围过滤），
 *              MySQL 8 Online DDL，不锁表、不改数据；加完后该 COUNT 走索引扫描 1~2 千条
 *              索引项，实测降到毫秒级。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 45,
  name: "notice_public_opportunity_index",
  async up(dbPool: Pool): Promise<void> {
    await ensureIndex(
      dbPool,
      "notice_public",
      "idx_np_opportunity",
      "ALTER TABLE notice_public ADD INDEX idx_np_opportunity (is_opportunity, deadline_ts)",
    );
  },
};
