/**
 * 074: supplier 表新增企业英文法务名列
 * supplier-english-name
 *
 * 背景：平台面向全球采购（联合国/国际公共采购），供应商投标时需英文公司名。
 * 新增 english_name 列承载企业英文法务名，作为选填字段。
 *
 * ★ 2026-09-28 退役：该列全库 67,747 行从未有值，门户输入框已于 2026-09-26 撤下，
 *   2026-09 影子表重建（supplier__new 换名）后列已物理删除。本迁移改为 no-op——
 *   已应用环境的账本记录保留，新环境/重建后的表结构不应再补回此列。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 74,
  name: "supplier-english-name",
  async up(_dbPool: Pool) {
    console.log("[migration-074] english_name 已随影子表重建退役，跳过");
  },
};

