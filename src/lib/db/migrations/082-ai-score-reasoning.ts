/**
 * 082: AI 评分新增推理过程字段
 *
 * - crm_notice_ai_summaries 表新增 score_reasoning 列（TEXT）
 *   存储 AI 评分的思维链推理过程文本
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 82,
  name: "ai-score-reasoning-column",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_notice_ai_summaries",
      "score_reasoning",
      "score_reasoning TEXT NULL COMMENT 'AI评分思维链推理过程文本' AFTER score_reasons",
    );
  },
};
