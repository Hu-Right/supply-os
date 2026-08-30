/**
 * 053: 研修班文件下载计数表
 * training-download-stats
 *
 * 修复审查报告 F16：原 033-training-download-stats 迁移因与
 * 033-main-table-dead-index-cleanup 版本号冲突从未注册，
 * crm_training_download_stats 建表不会在新库执行，而 training.repo 的
 * 下载计数运行时写入该表，新环境必现 ER_NO_SUCH_TABLE。
 * 本迁移以新版本号接管建表（幂等，存量库无影响）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 53,
  name: "training-download-stats",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_training_download_stats (
        material_id   VARCHAR(60)  NOT NULL PRIMARY KEY,
        file_name     VARCHAR(120) NOT NULL DEFAULT '',
        download_count INT         NOT NULL DEFAULT 0,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migration-053] crm_training_download_stats 表已确保存在");
  },
};
