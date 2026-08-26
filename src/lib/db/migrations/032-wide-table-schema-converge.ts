/**
 * 032: 宽表列类型前向收敛
 * crm_notice_search schema convergence (forward-only)
 *
 * @module server/db/migrations/032-wide-table-schema-converge
 * @description P1-17 修复配套：历史上 011 基线曾被回改（LONGTEXT ↔ VARCHAR），
 *              导致"新库"与"已应用旧 011 的存量库" schema 漂移。
 *              本迁移以幂等方式将 7 个 description 列收敛为最终类型 TEXT，
 *              保证任意起点的库在应用完全部迁移后 schema 完全一致。
 *              使用 TEXT 而非 VARCHAR(2000)，因宽表列数多，VARCHAR 会超出 MySQL 行大小限制 65535 字节。
 *              今后列类型变更一律新增前向迁移，禁止回改历史迁移文件。
 *
 *              执行流程（与 013 同构，幂等安全）：
 *              1. 已是 TEXT 的列跳过
 *              2. 分批截断超长数据后 MODIFY（避免 Data too long）
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const MAX_LEN = 2000;
const BATCH_SIZE = 5000;

const DESCRIPTION_COLUMNS = [
  "description", "description_zh", "description_en",
  "description_fr", "description_ru", "description_es", "description_ar",
];

export const migration: Migration = {
  version: 32,
  name: "wide-table-schema-converge",
  async up(dbPool: Pool) {
    const [tables] = await dbPool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_notice_search'"
    );
    if ((tables as RowDataPacket[]).length === 0) {
      console.log("[migration-032] crm_notice_search 不存在，跳过");
      return;
    }

    for (const col of DESCRIPTION_COLUMNS) {
      const [cols] = await dbPool.query(
        `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'crm_notice_search'
           AND column_name = ?`,
        [col]
      );
      const colInfo = (cols as RowDataPacket[])[0];
      if (!colInfo) continue;

      // 已收敛则跳过（幂等）
      const info = colInfo as unknown as { DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number };
      if (info.DATA_TYPE === "text") continue;

      // 超长数据分批截断，防止 MODIFY 时 Data too long
      while (true) {
        const [result] = await dbPool.query(
          `UPDATE crm_notice_search SET ${col} = LEFT(${col}, ?) WHERE CHAR_LENGTH(${col}) > ? LIMIT ${BATCH_SIZE}`,
          [MAX_LEN, MAX_LEN]
        );
        if ((result as { affectedRows: number }).affectedRows < BATCH_SIZE) break;
      }

      console.log(`[migration-032] ${col}: ${info.DATA_TYPE} → TEXT…`);
      await dbPool.query(
        `ALTER TABLE crm_notice_search MODIFY COLUMN ${col} TEXT NOT NULL`
      );
    }

    console.log("[migration-032] 宽表 description 列收敛完成");
  },
};
