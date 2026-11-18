/**
 * 迁移 050 — 注册标识类型化（供应商 / 采购主体）
 *
 * @description 背景（2026-11-18）：原先把「统一社会信用代码」当成全平台唯一的主体标识，
 *              香港（BR/CR）与海外（注册号/税号/VAT/EIN）主体没有 18 位中国码，被前端必填
 *              与文案卡住；同时查重按原文精确比较，补上分隔符/大小写差异就漏判。
 *
 *              本迁移只做结构层：
 *                - supplier：`credit_code` 放宽到 varchar(64)，新增 `credit_code_type`
 *                  （默认 uscc）与 `credit_code_norm`（归一号码，查重用）；
 *                - procurement_buyers：新增 `reg_no_type` / `reg_no_norm`；
 *                - 组合键索引 `(type, norm)`：避免「香港 8 位数字」和别国 8 位数字撞号；
 *                - 回填存量归一值（REGEXP_REPLACE 去分隔符 + UPPER），类型保持默认 uscc。
 *
 *              存量类型不做猜测：非 18 位的旧值仍标 uscc，由运营按证件复核后手工改类型
 *              （迁移日志会打印非 18 位存量条数，便于排期）。
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

async function hasIndex(pool: Pool, table: string, index: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function countRows(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/** 供应商侧：加类型/归一号列与组合键索引，回填存量归一值 */
async function migrateSupplier(pool: Pool): Promise<void> {
  if (!(await hasColumn(pool, "supplier", "credit_code_type"))) {
    await pool.query(
      "ALTER TABLE `supplier` ADD COLUMN `credit_code_type` varchar(24) NOT NULL DEFAULT 'uscc' "
        + "COMMENT '注册标识类型（uscc/hk_br/hk_cr/overseas_reg/tax_id/other）' AFTER `credit_code`",
    );
  }
  if (!(await hasColumn(pool, "supplier", "credit_code_norm"))) {
    await pool.query(
      "ALTER TABLE `supplier` ADD COLUMN `credit_code_norm` varchar(64) DEFAULT NULL "
        + "COMMENT '注册标识归一号码（去分隔符转大写，仅查重用）' AFTER `credit_code_type`",
    );
  }
  // 原文列放宽到 64：海外注册号常带分隔符，30 位不够
  await pool.query("ALTER TABLE `supplier` MODIFY COLUMN `credit_code` varchar(64) DEFAULT NULL");
  if (!(await hasIndex(pool, "supplier", "idx_supplier_credit_norm"))) {
    await pool.query(
      "ALTER TABLE `supplier` ADD KEY `idx_supplier_credit_norm` (`credit_code_type`,`credit_code_norm`)",
    );
  }
  await pool.query(
    `UPDATE supplier
        SET credit_code_norm = NULLIF(UPPER(REGEXP_REPLACE(credit_code, '[^0-9A-Za-z]', '')), '')
      WHERE credit_code IS NOT NULL AND TRIM(credit_code) <> '' AND credit_code_norm IS NULL`,
  );
  const total = await countRows(
    pool,
    "SELECT COUNT(*) AS n FROM supplier WHERE credit_code IS NOT NULL AND TRIM(credit_code) <> ''",
  );
  const notUscc = await countRows(
    pool,
    `SELECT COUNT(*) AS n FROM supplier
      WHERE credit_code_norm IS NOT NULL AND credit_code_norm <> '' AND CHAR_LENGTH(credit_code_norm) <> 18`,
  );
  console.log(
    `[migration 050] supplier 注册标识回填：有值 ${total} 条，其中非 18 位 ${notUscc} 条（类型暂标 uscc，待运营复核）`,
  );
}

/** 采购主体侧：加类型/归一号列与组合键索引，回填存量归一值 */
async function migrateBuyers(pool: Pool): Promise<void> {
  if (!(await hasColumn(pool, "procurement_buyers", "reg_no_type"))) {
    await pool.query(
      "ALTER TABLE `procurement_buyers` ADD COLUMN `reg_no_type` varchar(24) NOT NULL DEFAULT 'uscc' "
        + "COMMENT '注册标识类型（uscc/hk_br/hk_cr/overseas_reg/tax_id/other）' AFTER `reg_no`",
    );
  }
  if (!(await hasColumn(pool, "procurement_buyers", "reg_no_norm"))) {
    await pool.query(
      "ALTER TABLE `procurement_buyers` ADD COLUMN `reg_no_norm` varchar(64) DEFAULT NULL "
        + "COMMENT '注册标识归一号码（去分隔符转大写，仅查重用）' AFTER `reg_no_type`",
    );
  }
  if (!(await hasIndex(pool, "procurement_buyers", "idx_buyers_reg_norm"))) {
    await pool.query(
      "ALTER TABLE `procurement_buyers` ADD KEY `idx_buyers_reg_norm` (`reg_no_type`,`reg_no_norm`)",
    );
  }
  await pool.query(
    `UPDATE procurement_buyers
        SET reg_no_norm = NULLIF(UPPER(REGEXP_REPLACE(reg_no, '[^0-9A-Za-z]', '')), '')
      WHERE reg_no IS NOT NULL AND TRIM(reg_no) <> '' AND reg_no_norm IS NULL`,
  );
  const total = await countRows(
    pool,
    "SELECT COUNT(*) AS n FROM procurement_buyers WHERE reg_no IS NOT NULL AND TRIM(reg_no) <> ''",
  );
  console.log(`[migration 050] procurement_buyers 注册标识回填：有值 ${total} 条`);
}

export const migration: Migration = {
  version: 50,
  name: "registration_id_type",
  async up(dbPool: Pool): Promise<void> {
    await migrateSupplier(dbPool);
    await migrateBuyers(dbPool);
  },
};
