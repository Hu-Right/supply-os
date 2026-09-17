/**
 * 075: crm_notice_ai_summaries 表新增竞争格局和投标策略列
 * ai-summary-6-dimensions
 *
 * 背景：AI 拆标摘要从 4 维度升级到 6 维度，新增 competitive_landscape（竞争格局）
 * 和 bid_strategy（投标策略）两列。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 75,
  name: "ai-summary-6-dimensions",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool, "crm_notice_ai_summaries", "competitive_landscape",
      "competitive_landscape TEXT NULL COMMENT '竞争格局分析'",
    );
    await ensureColumn(
      dbPool, "crm_notice_ai_summaries", "bid_strategy",
      "bid_strategy TEXT NULL COMMENT '投标策略建议'",
    );
    console.log("[migration-075] crm_notice_ai_summaries 新增 competitive_landscape + bid_strategy 列");
  },
};
