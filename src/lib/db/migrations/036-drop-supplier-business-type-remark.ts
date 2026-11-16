/**
 * 迁移 036 · 影子表摘除 supplier 业务身份/备注字段
 *
 * @module server/db/migrations/036-drop-supplier-business-type-remark
 * @description 用户决定删除 business_type / business_type_code / remark：
 *              - 业务身份两个字段覆盖率低、口径不统一，且前台仅剩徽章；
 *              - remark 前后台均无可见消费方。
 *
 *              采用影子表重建（保留旧表可回滚）：
 *              1. CREATE TABLE supplier_new_036 LIKE supplier；
 *              2. 先删依赖 business_type 的生成列 data_quality_score，再删三个字段；
 *              3. 复制全量数据；
 *              4. 按 18 个资料字段重建 data_quality_score（满分 90）；
 *              5. RENAME 旧表为 supplier_old_c_20261116，新表接管 supplier。
 *
 *              不保留任何兼容列；旧值在备份表里。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DROPPED = ["business_type", "business_type_code", "remark"];
const NEW_TABLE = "supplier_new_036";
const OLD_BASE = "supplier_old_c_20261116";

/** data_quality_score 计分字段：19 个原字段中去掉 business_type，剩 18 个 × 5 分 = 90 */
const SCORE_FIELDS = [
  "country",
  "province",
  "city",
  "address",
  "contact",
  "position",
  "phone",
  "email",
  "website",
  "industry_code",
  "products",
  "certification",
  "established_at",
  "registered_capital",
  "credit_code",
  "legal_rep",
  "intro",
  "registered_address",
];

function scoreExpression(): string {
  const terms = SCORE_FIELDS.map(
    (field) => `((\`${field}\` is not null) and (trim(\`${field}\`) <> ''))`,
  ).join(" + ");
  return `round(((${terms}) * 5.0),2)`;
}

async function columnsOf(pool: Pool, table: string): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows;
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [table],
  );
  return rows.length > 0;
}

export const migration: Migration = {
  version: 36,
  name: "drop_supplier_business_type_remark",
  async up(dbPool: Pool): Promise<void> {
    const current = await columnsOf(dbPool, "supplier");
    if (!DROPPED.some((column) => current.some((row) => row.COLUMN_NAME === column))) return;

    const oldTable = (await tableExists(dbPool, OLD_BASE))
      ? `${OLD_BASE}_${Date.now()}`
      : OLD_BASE;

    if (await tableExists(dbPool, NEW_TABLE)) {
      await dbPool.query(`DROP TABLE \`${NEW_TABLE}\``);
    }
    await dbPool.query(`CREATE TABLE \`${NEW_TABLE}\` LIKE \`supplier\``);

    // 生成列依赖 business_type，必须先删；三个业务列随后删除
    const newCols = await columnsOf(dbPool, NEW_TABLE);
    if (newCols.some((row) => row.COLUMN_NAME === "data_quality_score")) {
      await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`data_quality_score\``);
    }
    for (const column of DROPPED) {
      if (newCols.some((row) => row.COLUMN_NAME === column)) {
        await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`${column}\``);
      }
    }

    const copyCols = (await columnsOf(dbPool, NEW_TABLE)).filter(
      (row) => !String(row.EXTRA ?? "").toUpperCase().includes("GENERATED"),
    );
    const list = copyCols.map((row) => `\`${row.COLUMN_NAME}\``).join(", ");
    await dbPool.query(
      `INSERT INTO \`${NEW_TABLE}\` (${list}) SELECT ${list} FROM \`supplier\``,
    );

    await dbPool.query(
      `ALTER TABLE \`${NEW_TABLE}\` ADD COLUMN \`data_quality_score\` decimal(5,2)
         GENERATED ALWAYS AS (${scoreExpression()}) STORED NOT NULL COMMENT '资料完整度。'`,
    );
    const [maxRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(\`id\`), 0) + 1 AS nextId FROM \`${NEW_TABLE}\``,
    );
    const nextId = Number(maxRows[0]?.nextId ?? 1);
    await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${nextId}`);

    await dbPool.query(
      `RENAME TABLE \`supplier\` TO \`${oldTable}\`, \`${NEW_TABLE}\` TO \`supplier\``,
    );
  },
};
