/**
 * 009: CRM 外部表索引补建
 * crm_bid_notices / crm_bid_opportunities / crm_unspsc_codes 上的性能索引
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndexIfTableExists, type Migration } from "./runner";

export const migration: Migration = {
  version: 9,
  name: "external-table-indexes",
  async up(dbPool: Pool) {
    // notice_id 索引
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_notice_id",
      "CREATE INDEX idx_notices_notice_id ON crm_bid_notices (notice_id)");

    // deadline_sec 生成列
    await ensureColumn(dbPool, "crm_bid_notices", "deadline_sec",
      "deadline_sec INT UNSIGNED AS (IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)) STORED");
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_deadline_sec",
      "CREATE INDEX idx_bid_notices_deadline_sec ON crm_bid_notices (deadline_sec)");

    // opportunities deadline_sec
    await ensureColumn(dbPool, "crm_bid_opportunities", "deadline_sec",
      "deadline_sec INT UNSIGNED AS (IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)) STORED");
    await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_deadline_sec",
      "CREATE INDEX idx_opp_deadline_sec ON crm_bid_opportunities (deadline_sec)");

    // UNSPSC 索引
    await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_level_id",
      "CREATE INDEX idx_unspsc_level_id ON crm_unspsc_codes (level, id)");
    await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_parent_code",
      "CREATE INDEX idx_unspsc_parent_code ON crm_unspsc_codes (parent_id, code)");

    // opportunities 覆盖索引
    await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_qualified_id",
      "CREATE INDEX idx_opp_qualified_id ON crm_bid_opportunities (is_qualified, status, audit_status, id)");
    await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_source_covering",
      "CREATE INDEX idx_opp_source_covering ON crm_bid_opportunities (source_notice_id, is_qualified, status, audit_status)");

    // is_featured 预计算列
    await ensureColumn(dbPool, "crm_bid_notices", "is_featured",
      "is_featured TINYINT(1) NOT NULL DEFAULT 0");
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_featured",
      "CREATE INDEX idx_bid_notices_featured ON crm_bid_notices (is_featured)");

    // 复合筛选索引
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_filter",
      "CREATE INDEX idx_notices_filter ON crm_bid_notices (country(100), agency(100), notice_type(50))");

    // is_active 预计算列
    await ensureColumn(dbPool, "crm_bid_notices", "is_active",
      "is_active TINYINT(1) NOT NULL DEFAULT 1");
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_active_deadline",
      "CREATE INDEX idx_notices_active_deadline ON crm_bid_notices (is_active, deadline_sec)");
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_active_deadline_id",
      "CREATE INDEX idx_bid_notices_active_deadline_id ON crm_bid_notices (is_expired, deadline_ts, id)");

    // 搜索复合索引
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_search_composite",
      "CREATE INDEX idx_search_composite ON crm_bid_notices (is_active, deadline_sec, country(50), notice_type(50))");
  },
};
