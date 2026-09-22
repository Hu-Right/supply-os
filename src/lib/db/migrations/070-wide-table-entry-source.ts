/**
 * 070: crm_notice_search 宽表增加 entry_source 列
 * wide-table-entry-source
 *
 * 同步主表 crm_bid_notices.entry_source 到宽表，
 * 使宽表查询可按数据来源过滤（RFQ 广场等场景）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 70,
  name: "wide-table-entry-source",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool, "crm_notice_search", "entry_source",
      "entry_source VARCHAR(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源（同步自主表）' AFTER is_featured",
    );
    console.log("[migration-070] crm_notice_search.entry_source 已就绪");
  },
};
