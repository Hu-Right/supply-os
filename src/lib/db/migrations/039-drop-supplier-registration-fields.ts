/**
 * 迁移 039 — 影子表摘除 supplier 注册电话/邮箱/地址
 *
 * @module server/db/migrations/039-drop-supplier-registration-fields
 * @description 用户确认按方案 A 下线：registered_phone / registered_email /
 *              registered_address。三列合计只有 59 条有值（地址 41、电话 30、
 *              邮箱 15），内网源库对应列全空，无法回填；注册电话/邮箱在门户
 *              也没有编辑入口。
 *
 *              - 先把任意一个有值的 59 条归档到
 *                supplier_registration_archive_20261117；
 *              - 再影子表重建删除三列；
 *              - data_quality_score 由 18 项改为 17 项（去掉 registered_address），
 *                满分从 90 改为 85。
 *
 *              addtime / updated_at 不动。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DROPPED = ["registered_phone", "registered_email", "registered_address"];
const NEW_TABLE = "supplier_new_039";
const OLD_BASE = "supplier_old_g_20261117";
const ARCHIVE_TABLE = "supplier_registration_archive_20261117";

/** data_quality_score 计分字段：17 列 × 5 分 = 85 */
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

async function archiveRegistration(pool: Pool): Promise<void> {
  const current = await columnsOf(pool, "supplier");
  if (!current.some((row) => row.COLUMN_NAME === "registered_address")) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${ARCHIVE_TABLE}\` (
       \`id\` int NOT NULL,
       \`registered_address\` varchar(255) NULL,
       \`registered_phone\` varchar(40) NULL,
       \`registered_email\` varchar(120) NULL,
       \`archived_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  );
  await pool.query(
    `INSERT INTO \`${ARCHIVE_TABLE}\`
       (\`id\`, \`registered_address\`, \`registered_phone\`, \`registered_email\`)
     SELECT \`id\`, \`registered_address\`, \`registered_phone\`, \`registered_email\`
       FROM \`supplier\`
      WHERE TRIM(COALESCE(\`registered_address\`, '')) <> ''
         OR TRIM(COALESCE(\`registered_phone\`, '')) <> ''
         OR TRIM(COALESCE(\`registered_email\`, '')) <> ''
     ON DUPLICATE KEY UPDATE
       \`registered_address\` = VALUES(\`registered_address\`),
       \`registered_phone\` = VALUES(\`registered_phone\`),
       \`registered_email\` = VALUES(\`registered_email\`)`,
  );

  const [sourceRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`supplier\`
      WHERE TRIM(COALESCE(\`registered_address\`, '')) <> ''
         OR TRIM(COALESCE(\`registered_phone\`, '')) <> ''
         OR TRIM(COALESCE(\`registered_email\`, '')) <> ''`,
  );
  const [archiveRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM \`${ARCHIVE_TABLE}\``,
  );
  const sourceCount = Number(sourceRows[0]?.n ?? 0);
  const archiveCount = Number(archiveRows[0]?.n ?? 0);
  if (archiveCount < sourceCount) {
    throw new Error(
      `注册信息归档不完整：source=${sourceCount}, archive=${archiveCount}`,
    );
  }
  console.log(
    `[migration 039] 注册电话/邮箱/地址已归档 ${archiveCount} 条 → ${ARCHIVE_TABLE}`,
  );
}

export const migration: Migration = {
  version: 39,
  name: "drop_supplier_registration_fields",
  async up(dbPool: Pool): Promise<void> {
    const current = await columnsOf(dbPool, "supplier");
    if (!DROPPED.some((column) => current.some((row) => row.COLUMN_NAME === column))) {
      return;
    }

    await archiveRegistration(dbPool);

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
         GENERATED ALWAYS AS (${scoreExpression()}) STORED NOT NULL
         COMMENT '资料完整度评分（17 项 ×5，满分 85）'`,
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