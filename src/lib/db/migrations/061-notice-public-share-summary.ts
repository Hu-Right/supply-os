/**
 * 迁移 061 — notice_public 增加分享卡摘要列
 *
 * @module server/db/migrations/061-notice-public-share-summary
 * @description 2026-11-19：分享卡（微信/WhatsApp/LinkedIn 预览 + 面板预览）需要一段
 *              1–2 句的公告摘要。摘要由构建器（build.ts → share-summary.ts）在写服务表时
 *              生成，卡片、分享文案、列表 teaser 共用同一段文字，避免三处各截一遍正文。
 *
 *              - 中文 ≤ 90 字，英文 ≤ 180 字符（VARCHAR(300) 足够，留人工润色余量）；
 *              - 抽不出可用文本时落 NULL：读侧回退标题，不硬造句子；
 *              - 历史行由回填脚本（notice-public-backfill-share-summary）补齐，
 *                未回填前读侧同样走 `share_summary ?? buildShareSummary(...)` 回退。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 61,
  name: "notice_public_share_summary",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "notice_public",
      "share_summary",
      "share_summary VARCHAR(300) NULL COMMENT '分享卡摘要（中文，≤90 字，构建期生成；空则读侧回退标题）'",
    );
    await ensureColumn(
      dbPool,
      "notice_public",
      "share_summary_en",
      "share_summary_en VARCHAR(300) NULL COMMENT '分享卡摘要（英文，≤180 字符，构建期生成；空则读侧回退标题）'",
    );
  },
};
