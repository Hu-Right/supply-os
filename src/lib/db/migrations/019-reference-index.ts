/**
 * 019: 参考号精确匹配索引
 * reference-index
 *
 * 为宽表和主表的 reference 列添加 B-tree 索引，
 * 支持参考号/编号的精确匹配快速路径（< 1ms），
 * 避免全文搜索分词差异导致的搜索结果不一致。
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

async function ensureIndex(pool: Pool, table: string, indexName: string, ddl: string) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, indexName],
  );
  if ((rows as any[]).length === 0) {
    await pool.query(ddl);
  }
}

export const migration: Migration = {
  version: 19,
  name: "reference-index",
  async up(dbPool: Pool) {
    // 宽表 reference 精确匹配索引
    await ensureIndex(dbPool, "crm_notice_search", "idx_ns_reference",
      "CREATE INDEX idx_ns_reference ON crm_notice_search (reference(200), is_active)");

    // 主表 reference 精确匹配索引（降级路径使用）
    await ensureIndex(dbPool, "crm_bid_notices", "idx_notices_reference",
      "CREATE INDEX idx_notices_reference ON crm_bid_notices (reference(200), is_active)");
  },
};
