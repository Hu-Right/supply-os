/**
 * 077: crm_notice_ai_summaries 表新增 AI 适配评分列
 * ai-score-columns
 *
 * 背景：AI 适配评分功能需要存储 7 个维度分数 + 综合分。
 * 维度：资质匹配/经验匹配/认证覆盖/地域适配/规模匹配/交期适配/价格竞争力。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 77,
  name: "ai-score-columns",
  async up(dbPool: Pool) {
    const cols: [string, string][] = [
      ["score_qualification", "score_qualification TINYINT UNSIGNED NULL COMMENT '资质匹配度(0-100)'"],
      ["score_experience", "score_experience TINYINT UNSIGNED NULL COMMENT '经验匹配度(0-100)'"],
      ["score_certification", "score_certification TINYINT UNSIGNED NULL COMMENT '认证覆盖度(0-100)'"],
      ["score_region", "score_region TINYINT UNSIGNED NULL COMMENT '地域适配度(0-100)'"],
      ["score_scale", "score_scale TINYINT UNSIGNED NULL COMMENT '规模匹配度(0-100)'"],
      ["score_delivery", "score_delivery TINYINT UNSIGNED NULL COMMENT '交期适配度(0-100)'"],
      ["score_price", "score_price TINYINT UNSIGNED NULL COMMENT '价格竞争力(0-100)'"],
      ["score_overall", "score_overall TINYINT UNSIGNED NULL COMMENT '综合适配分(0-100)'"],
      ["score_reasons", "score_reasons TEXT NULL COMMENT '各维度评分理由JSON'"],
    ];
    for (const [name, ddl] of cols) {
      await ensureColumn(dbPool, "crm_notice_ai_summaries", name, ddl);
    }
    console.log("[migration-077] crm_notice_ai_summaries 新增 8 个评分列");
  },
};
