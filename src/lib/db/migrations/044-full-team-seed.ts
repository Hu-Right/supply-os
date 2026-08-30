/**
 * 044: 补全全员种子数据 + 预生成邀请码
 * full-team-seed
 *
 * 种子数据已禁用——迁移保留版本号占位。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 44,
  name: "full-team-seed",
  async up(_dbPool: Pool) {
    // 种子数据已禁用——不再对数据库进行任何读写
    console.log("[migration-044] 全员种子数据已禁用，跳过");
  },
};
