/**
 * 091: 爬虫同步水位线控制表
 * sync-watermark
 *
 * @module server/db/migrations/091-sync-watermark-table
 * @description 将原 scripts/daily-sync.cjs 的 .sync-watermark.json 文件水位线迁入控制表，
 *              供应用内定时爬虫同步任务（search-sync/crawler-sync.ts）读写。
 *              相比文件，控制表在多实例 / 进程重启下更稳，且水位线与数据写入同库，
 *              保障"仅确认写入后推进"的完整性语义。
 *
 *              time_wm 以 VARCHAR 存储，跟随各表 update_time 列原生类型：
 *              DATETIME 列存 "YYYY-MM-DD HH:MM:SS" 字符串，Unix 秒整数列存秒数字符串。
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 91,
  name: "sync-watermark-table",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_sync_watermark (
        table_name  VARCHAR(64)     NOT NULL PRIMARY KEY,
        id_wm       BIGINT UNSIGNED NOT NULL DEFAULT 0,
        time_wm     VARCHAR(32)     NULL,
        updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[migration-091] 爬虫同步水位线控制表已就绪");
  },
};
