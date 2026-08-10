/**
 * 010: FULLTEXT 全文索引
 * crm_bid_notices / crm_notice_translations 上的全文搜索索引
 */
import type { Pool } from "mysql2/promise";
import { ensureIndexIfTableExists, type Migration } from "./runner";

export const migration: Migration = {
  version: 10,
  name: "fulltext-indexes",
  async up(dbPool: Pool) {
    // 中文 FULLTEXT（ngram）
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_search",
      "CREATE FULLTEXT INDEX ft_notices_search ON crm_bid_notices (title, reference, description) WITH PARSER ngram");

    // 英文 FULLTEXT（title+reference）
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_en",
      "CREATE FULLTEXT INDEX ft_notices_en ON crm_bid_notices (title, reference)");

    // 英文 description 补充 FULLTEXT
    await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_desc",
      "CREATE FULLTEXT INDEX ft_notices_desc ON crm_bid_notices (description)");

    // 翻译表 FULLTEXT（ngram，支持中英文跨语言搜索）
    await ensureIndexIfTableExists(dbPool, "crm_notice_translations", "ft_trans_search",
      "CREATE FULLTEXT INDEX ft_trans_search ON crm_notice_translations (title_tr, description_tr) WITH PARSER ngram");
  },
};
