/**
 * 迁移 048 — notice_public 增加「是否有附件」虚拟生成列 + 索引
 *
 * @module server/db/migrations/048-notice-public-has-attachments
 * @description 2026-11-18：首页/列表规模条「含原始文件」指标改读服务表。
 *              `notice_public` 只有 `attachments` JSON 列（附件列表，构建时经旁表
 *              attachment_text 状态过滤 + 去重），直接 `JSON_LENGTH(attachments) > 0`
 *              无法走索引（实测 15.3s 全表扫 53 万行）。
 *
 *              本迁移只加一个 **VIRTUAL 生成列**（不占行存储，写入时由 MySQL 自动
 *              从 attachments 计算，服务表构建器零改动）+ 复合索引：
 *                has_attachments = COALESCE(JSON_LENGTH(attachments), 0) > 0
 *                idx_np_has_att (has_attachments, deadline_ts)
 *              加完后「含附件且有效」的 COUNT 走索引扫描（毫秒级）。
 *
 *              口径提示：服务表只计「用户实际可下载的附件」，与宽表
 *              notice_search.documents_count（主表原始 documents/procurement_files 计数）
 *              差约 3%（约 24.0 万 vs 24.8 万），属预期。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 48,
  name: "notice_public_has_attachments",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "notice_public",
      "has_attachments",
      "has_attachments TINYINT(1) GENERATED ALWAYS AS (COALESCE(JSON_LENGTH(attachments), 0) > 0) VIRTUAL COMMENT '是否有可下载附件（虚拟生成列，由 attachments 自动计算；规模条/检索过滤用）'",
    );
    await ensureIndex(
      dbPool,
      "notice_public",
      "idx_np_has_att",
      "ALTER TABLE notice_public ADD INDEX idx_np_has_att (has_attachments, deadline_ts)",
    );
  },
};
