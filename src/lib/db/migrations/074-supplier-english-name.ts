/**
 * 074: supplier 表新增企业英文法务名列
 * supplier-english-name
 *
 * 背景：平台面向全球采购（联合国/国际公共采购），供应商投标时需英文公司名。
 * 新增 english_name 列承载企业英文法务名，作为选填字段。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 74,
  name: "supplier-english-name",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool, "supplier", "english_name",
      "english_name VARCHAR(200) NULL COMMENT '企业英文法务名'",
    );
    console.log("[migration-074] supplier 新增 english_name 列");
  },
};
