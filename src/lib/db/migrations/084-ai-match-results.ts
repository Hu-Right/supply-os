/**
 * 084: crm_notice_ai_summaries 新增 match_results 列
 * ai-match-results
 *
 * 背景：AI 智能匹配（Top N 排行 JSON）此前复用评分列 score_reasons，
 *       与 AI 适配评分共用同一 (user_id, notice_id) 行、同一列，互相覆盖踩踏。
 *       本迁移为匹配结果建立独立列，实现评分与匹配缓存彻底分键。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 84,
  name: "ai-match-results",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool, "crm_notice_ai_summaries", "match_results",
      "match_results TEXT NULL COMMENT 'AI 智能匹配 Top N 结果JSON（与评分 score_reasons 分键）'",
    );
    console.log("[migration-084] crm_notice_ai_summaries 新增 match_results 列");
  },
};
