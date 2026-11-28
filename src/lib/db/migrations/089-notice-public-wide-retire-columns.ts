/**
 * 迁移 089 · 服务表补齐宽表退役所需三列
 *
 * @module lib/db/migrations/089-notice-public-wide-retire-columns
 * @description 宽表（`notice_search`）退役的前提：把宽表独有的三列搬到服务表，
 *              让检索/展示读源可以整体切到 `notice_public`。
 *
 *              - `title_en` / `description_en`：英文译文（翻译表 `lang='en'`），
 *                Meili 的英文检索字段来源；中文侧的 `title_cn/description_cn` 已有先例。
 *              - `backbone_path`：品目骨架路径（UGT 节点码含全部祖先，ASCII 逗号分隔），
 *                与 `notice_search.backbone_path` 同形制；由构建期 `loadBackboneMap`
 *                从 `notice_attribution_nodes` 落点算出，不再依赖宽表。
 *
 *              三列全部追加在表尾，与 `PUBLIC_COLS` / baseline 的列序保持一致
 *              （门禁 N2 逐列比对）。ADD COLUMN 带 NULL 默认值，MySQL 8 走 INSTANT，不锁表。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 89,
  name: "notice_public_wide_retire_columns",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "notice_public",
      "title_en",
      "title_en VARCHAR(1000) DEFAULT NULL COMMENT '英文标题（翻译表 lang=en；宽表退役后替代 notice_search.title_en）' AFTER share_summary_en",
    );
    await ensureColumn(
      dbPool,
      "notice_public",
      "description_en",
      "description_en LONGTEXT COMMENT '英文正文（翻译表 lang=en）' AFTER title_en",
    );
    await ensureColumn(
      dbPool,
      "notice_public",
      "backbone_path",
      "backbone_path MEDIUMTEXT COMMENT '品目骨架路径（UGT 节点码含祖先，逗号分隔；替代 notice_search.backbone_path）' AFTER description_en",
    );
  },
};
