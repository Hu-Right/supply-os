/**
 * 迁移 046 — notice_public 增加 (country_code, deadline_ts) 复合索引（首页「数据源/API」国家数走服务表）
 *
 * @module server/db/migrations/046-notice-public-country-index
 * @description 2026-11-18：首页规模指标「数据源/API」= 覆盖国家/地区数，改读服务表
 *              notice_public.country_code（构建时已按 country_aliases 归一，读侧零归一化；
 *              口径为主国家 ISO2，当前 189 个国家/地区）。
 *              该 COUNT(DISTINCT country_code) + 截止谓词原先无索引（实测 16.3s 全表扫），
 *              本迁移只加一条二级索引（Online DDL，不锁表、不改数据），让 DISTINCT 计数
 *              走索引扫描。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 46,
  name: "notice_public_country_index",
  async up(dbPool: Pool): Promise<void> {
    await ensureIndex(
      dbPool,
      "notice_public",
      "idx_np_country_deadline",
      "ALTER TABLE notice_public ADD INDEX idx_np_country_deadline (country_code, deadline_ts)",
    );
  },
};
