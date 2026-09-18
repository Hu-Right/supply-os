/**
 * 080: 移除 UNSPSC 译文缓存表
 * drop-unspsc-translations
 *
 * crm_unspsc_translations 表从未被写入过数据（upsertUnspscTranslations 方法从未被调用），
 * 属于死代码，安全删除。API 路由直接回退使用 crm_unspsc_codes 原始列。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 80,
  name: "drop-unspsc-translations",
  async up(dbPool: Pool) {
    await dbPool.query("DROP TABLE IF EXISTS crm_unspsc_translations");
  },
};
