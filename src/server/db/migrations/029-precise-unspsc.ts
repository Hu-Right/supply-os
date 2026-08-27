/**
 * 029: 宽表精准分类列（商机 approved 精准码，行业匹配用）
 * precise_levelN 语义：有 approved 精准码时存精准码解析出的五级 id，
 * 否则由 buildWideRow 回填原标签码（合并语义，单一事实源）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 29,
  name: "precise-unspsc",
  async up(dbPool: Pool) {
    // 注：改用 TEXT 而非 VARCHAR(2000)，因宽表列数多已接近 MySQL 行大小限制 65535 字节
    // TEXT 类型不计入行大小限制，且 precise_levelN 实际存储逗号分隔 ID 串（通常<200 字符）
    await ensureColumn(dbPool, "crm_notice_search", "precise_level1",
      "precise_level1 TEXT NOT NULL COMMENT '精准 UNSPSC 一级 ID（approved 候选码解析，无则回填原标签）' AFTER unspsc_level5");
    await ensureColumn(dbPool, "crm_notice_search", "precise_level2",
      "precise_level2 TEXT NOT NULL AFTER precise_level1");
    await ensureColumn(dbPool, "crm_notice_search", "precise_level3",
      "precise_level3 TEXT NOT NULL AFTER precise_level2");
    await ensureColumn(dbPool, "crm_notice_search", "precise_level4",
      "precise_level4 TEXT NOT NULL AFTER precise_level3");
    await ensureColumn(dbPool, "crm_notice_search", "precise_level5",
      "precise_level5 TEXT NOT NULL AFTER precise_level4");
  },
};
