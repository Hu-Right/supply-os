/**
 * 007 · 企业证据关联 upload_files 文件名
 *
 * @module server/db/migrations/007-enterprise-evidence-filename
 * @description upload_files 主键是 filename（无自增 id），006 里的 upload_file_id 无法承载关联；
 *              补 upload_filename 列，证据与文件字节按文件名关联。幂等：列已存在则跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export const migration = {
  version: 7,
  name: "enterprise-evidence-filename",
  async up(dbPool: Pool): Promise<void> {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enterprise_evidence' AND COLUMN_NAME = 'upload_filename'`,
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    await dbPool.query(
      "ALTER TABLE enterprise_evidence ADD COLUMN upload_filename VARCHAR(255) NULL COMMENT '关联 upload_files.filename（主键即文件名）' AFTER upload_file_id",
    );
  },
};
