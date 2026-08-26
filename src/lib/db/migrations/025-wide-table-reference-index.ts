/**
 * 025: 宽表 reference 列索引
 * crm_notice_search: 添加 idx_ns_reference 索引
 *
 * @module server/db/migrations/025-wide-table-reference-index
 * @description 为宽表 reference 列添加 B-tree 索引，
 *              使参考号精确匹配快速路径（notice-search/index.ts）
 *              真正走索引查找（< 1ms），而非全表扫描。
 */
import type { Pool } from "mysql2/promise";
import { ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 25,
  name: "wide-table-reference-index",
  async up(dbPool: Pool) {
    await ensureIndex(
      dbPool,
      "crm_notice_search",
      "idx_ns_reference",
      "CREATE INDEX idx_ns_reference ON crm_notice_search (reference)",
    );
  },
};
