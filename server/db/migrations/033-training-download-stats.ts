/**
 * 033: 研修班文件下载计数持久化
 *
 * @description 将原内存 Record<string, number> 下载计数迁移到数据库表，
 *              进程重启不丢失数据，多实例部署数据一致。
 * @module server/db/migrations/033-training-download-stats
 */
import type { Pool } from "mysql2/promise";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_training_download_stats (
      material_id   VARCHAR(60)  NOT NULL PRIMARY KEY,
      file_name     VARCHAR(120) NOT NULL DEFAULT '',
      download_count INT         NOT NULL DEFAULT 0,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("[migration-033] crm_training_download_stats 表创建完成");
}

export async function down(pool: Pool): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS crm_training_download_stats");
  console.log("[migration-033] crm_training_download_stats 表已删除");
}
