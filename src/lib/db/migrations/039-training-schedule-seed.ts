/**
 * 039: 研修班期次数据初始化
 * Training schedule seed data
 *
 * @description 插入 3 期研修班期次数据：
 *              - 第 1 期：2026-07-20（已截止）
 *              - 第 2 期：2026-08-20（已截止）
 *              - 第 3 期：2026-09-20（报名中）
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 39,
  name: "training-schedule-seed",
  async up(_dbPool: Pool) {
    // 种子数据已禁用——不再对数据库进行任何读写
    console.log("[migration-039] 研修班期次种子已禁用，跳过");
  },
};
