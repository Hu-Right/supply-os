/**
 * 迁移 038 — 影子表摘除 supplier 三个无消费字段
 *
 * @module server/db/migrations/038-drop-supplier-dead-fields
 * @description 用户确认下线：business_type_code / industry_code_name / check_note。
 *              - business_type_code：云库全表 NULL，代码无读写；
 *              - industry_code_name：物理冗余列，读路径统一走 industry_nodes JOIN 别名；
 *              - check_note：821 条历史核对备注，先归档到 supplier_check_note_archive_20261117，
 *                再随影子表删除；后台页面不展示，审计快照同步移除该列。
 *
 *              addtime 保留：它是全表唯一创建时间，报表/门户/sitemap/Open API 仍在消费。
 *
 *              影子表重建流程：
 *              1. CREATE TABLE supplier_new_038 LIKE supplier；
 *              2. 先删生成列 data_quality_score，再删目标列；
 *              3. 全量拷贝；
 *              4. 按 18 个字段重建 data_quality_score（满分 90）；
 *              5. RENAME 旧表为 supplier_old_e_20261117，新表接管 supplier。
 *
 *              任何删除列的值都保留在旧表/归档表中，可回滚。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DROPPED = ["business_type_code", "industry_code_name", "check_note"];
const NEW_TABLE = "supplier_new_038";
const OLD_BASE = "supplier_old_e_20261117";
const ARCHIVE_TABLE = "supplier_check_note_archive_20261117";

/** data_quality_score 计分字段：18 列 × 5 分 = 90 */
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

async function archiveCheckNote(pool: Pool): Promise<void> {
  const current = await columnsOf(pool, "supplier");
  if (!current.some((row) => row.COLUMN_NAME === "check_note")) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${ARCHIVE_TABLE}\` (
       \`id\` int NOT NULL,
       \`check_note\` text NULL,
       \`archived_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  );
  await pool.query(
    `INSERT INTO \`${ARCHIVE_TABLE}\` (\`id\`, \`check_note\`)
     SELECT \`id\`, \`check_note\` FROM \`supplier\`
      WHERE \`check_note\` IS NOT NULL AND TRIM(\`check_note\`) <> ''
     ON DUPLICATE KEY UPDATE \`check_note\` = VALUES(\`check_note\`)`,
  );

  const [sourceRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`supplier\`
      WHERE \`check_note\` IS NOT NULL AND TRIM(\`check_note\`) <> ''`,
  );
  const [archiveRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${ARCHIVE_TABLE}\``,
  );
  const sourceCount = Number(sourceRows[0]?.n ?? 0);
  const archiveCount = Number(archiveRows[0]?.n ?? 0);
  if (archiveCount < sourceCount) {
    throw new Error(
      `check_note 归档不完整：source=${sourceCount}, archive=${archiveCount}`,
    );
  }
  console.log(
    `[migration 038] check_note 已归档 ${archiveCount} 条 → ${ARCHIVE_TABLE}`,
  );
}

export const migration: Migration = {
  version: 38,
  name: "drop_supplier_dead_fields",
  async up(dbPool: Pool): Promise<void> {
    const current = await columnsOf(dbPool, "supplier");
    if (!DROPPED.some((column) => current.some((row) => row.COLUMN_NAME === column))) {
      return;
    }

    await archiveCheckNote(dbPool);

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
         GENERATED ALWAYS AS (${scoreExpression()}) STORED NOT NULL COMMENT '资料完整度评分'`,
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