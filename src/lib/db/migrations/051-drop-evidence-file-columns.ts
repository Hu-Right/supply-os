/**
 * 迁移 051 — 摘除 enterprise_evidence 的文件关联列（证据改为纯登记）
 *
 * @description 背景（2026-11-18）：证据资料原先允许上传 PDF/图片/Office/zip（≤10MB），
 *              文件字节落 upload_files、元数据行按 upload_filename 关联。核实后：
 *                - 投标可行性报告只引用证据的「类目 + 标题 + 有效期」元数据，**从不读文件内容**；
 *                - 生产库 enterprise_evidence 0 行，无存量数据迁移负担；
 *                - 托管企业文件要防病毒/恶意文件/版权/隐私，且会误导为「平台已核验」。
 *              故整体摘除上传能力：删除 upload_file_id / upload_filename 两列，
 *              证据只保留登记字段（category / title / valid_* / no_expiry / confirmed）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

async function hasColumn(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

export const migration: Migration = {
  version: 51,
  name: "drop_evidence_file_columns",
  async up(dbPool: Pool): Promise<void> {
    for (const column of ["upload_filename", "upload_file_id"]) {
      if (!(await hasColumn(dbPool, "enterprise_evidence", column))) continue;
      await dbPool.query(`ALTER TABLE \`enterprise_evidence\` DROP COLUMN \`${column}\``);
      console.log(`[migration 051] 已摘除 enterprise_evidence.${column}（证据改为纯登记）`);
    }
  },
};
