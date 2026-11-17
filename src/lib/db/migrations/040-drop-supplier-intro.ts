/**
 * 迁移 040 — 影子表摘除 supplier 企业介绍（intro）
 *
 * @module server/db/migrations/040-drop-supplier-intro
 * @description 2026-11-17 用户确认退役企业介绍字段：
 *              - 全库 102,624 家供应商里只有 3,672 家有值（3.6%），内容以营销话术/噪音为主，
 *                且不参与撮合（撮合走行业码/品目码/主营产品），门户仅作展示与大模型打分上下文；
 *              - 先把有值的行归档到 supplier_intro_archive_20261117；
 *              - 再影子表重建：先删依赖它的生成列 data_quality_score，删掉 intro，
 *                按 16 个资料字段重建 data_quality_score（满分 80）；
 *              - 后台（intelligence-daily）已同步下线该字段的展示与编辑。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const NEW_TABLE = "supplier_new_040";
const OLD_BASE = "supplier_old_intro_20261117";
const ARCHIVE_TABLE = "supplier_intro_archive_20261117";

/** data_quality_score 计分字段：16 列 × 5 分 = 80（去掉 intro） */
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

async function archiveIntro(pool: Pool): Promise<void> {
  const current = await columnsOf(pool, "supplier");
  if (!current.some((row) => row.COLUMN_NAME === "intro")) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${ARCHIVE_TABLE}\` (
       \`id\` bigint unsigned NOT NULL,
       \`intro\` text NULL,
       \`archived_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  );
  await pool.query(
    `INSERT INTO \`${ARCHIVE_TABLE}\` (\`id\`, \`intro\`)
     SELECT \`id\`, \`intro\` FROM \`supplier\`
      WHERE TRIM(COALESCE(\`intro\`, '')) <> ''
     ON DUPLICATE KEY UPDATE \`intro\` = VALUES(\`intro\`)`,
  );

  const [sourceRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`supplier\` WHERE TRIM(COALESCE(\`intro\`, '')) <> ''`,
  );
  const [archiveRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${ARCHIVE_TABLE}\``,
  );
  const sourceCount = Number(sourceRows[0]?.n ?? 0);
  const archiveCount = Number(archiveRows[0]?.n ?? 0);
  if (archiveCount < sourceCount) {
    throw new Error(`企业介绍归档不完整：source=${sourceCount}, archive=${archiveCount}`);
  }
  console.log(`[migration 040] 企业介绍已归档 ${archiveCount} 条 → ${ARCHIVE_TABLE}`);
}

export const migration: Migration = {
  version: 40,
  name: "drop_supplier_intro",
  async up(dbPool: Pool): Promise<void> {
    const current = await columnsOf(dbPool, "supplier");
    if (!current.some((row) => row.COLUMN_NAME === "intro")) return;

    await archiveIntro(dbPool);

    const oldTable = (await tableExists(dbPool, OLD_BASE))
      ? `${OLD_BASE}_${Date.now()}`
      : OLD_BASE;

    if (await tableExists(dbPool, NEW_TABLE)) {
      await dbPool.query(`DROP TABLE \`${NEW_TABLE}\``);
    }
    await dbPool.query(`CREATE TABLE \`${NEW_TABLE}\` LIKE \`supplier\``);

    const newCols = await columnsOf(dbPool, NEW_TABLE);
    if (newCols.some((row) => row.COLUMN_NAME === "data_quality_score")) {
      await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`data_quality_score\``);
    }
    if (newCols.some((row) => row.COLUMN_NAME === "intro")) {
      await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`intro\``);
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
         GENERATED ALWAYS AS (${scoreExpression()}) STORED NOT NULL
         COMMENT '资料完整度评分（16 项 ×5，满分 80）'`,
    );
    const [maxRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(\`id\`), 0) + 1 AS nextId FROM \`${NEW_TABLE}\``,
    );
    const nextId = Number(maxRows[0]?.nextId ?? 1);
    await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${nextId}`);

    await dbPool.query(
      `RENAME TABLE \`supplier\` TO \`${oldTable}\`, \`${NEW_TABLE}\` TO \`supplier\``,
    );
    console.log(`[migration 040] supplier.intro 已摘除（旧表备份 ${oldTable}）`);
  },
};
