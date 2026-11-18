/**
 * 迁移 043 — 影子表摘除 buyer.parent_buyer_id
 *
 * @module server/db/migrations/043-buyer-drop-parent
 * @description 2026-11-18 判定该列为死列后删除：
 *              - 全表 106,173 行 `parent_buyer_id` 非空 0 行（机构层级从未落数据）；
 *              - 门户仓仅 db/schema/baseline.sql 出现该列，运营后台仓零引用；
 *              - 无外键、无触发器、无视图、无索引依赖（唯一提及 buyer 的视图
 *                v_procurement_review_queue 用的是 procurement_buyers，与本表无关）。
 *
 *              做法沿用 ADR-0003 影子表切换：
 *                CREATE TABLE buyer__new LIKE buyer → DROP COLUMN → 全列显式拷贝
 *                → 校验行数/最大 id → RENAME 原子切换 → DROP 旧表。
 *              按用户口径不保留备份表（列 100% NULL，回滚=加回空列，无数据损失）。
 *
 *              影子表名用 `buyer__new` 而非 `buyer_new_043`，是为了命中
 *              scripts/tools/baseline-exclude.mjs 的 /__new$/ 排除规则——迁移中断
 *              残留时不会污染重导出来的结构基线。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "buyer";
const NEW_TABLE = "buyer__new";
const OLD_TABLE = "buyer_old_043";
const DEAD_COLUMN = "parent_buyer_id";

async function columnsOf(pool: Pool, table: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows.map((row) => String(row.COLUMN_NAME));
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [table],
  );
  return rows.length > 0;
}

/** 失败重入/重放时清理中间表（buyer 已无该列即代表上一轮已完成切换） */
async function dropLeftovers(pool: Pool): Promise<void> {
  for (const table of [NEW_TABLE, OLD_TABLE]) {
    if (await tableExists(pool, table)) {
      await pool.query(`DROP TABLE \`${table}\``);
      console.log(`[migration 043] 清理残留中间表 ${table}`);
    }
  }
}

export const migration: Migration = {
  version: 43,
  name: "drop_buyer_parent",
  async up(dbPool: Pool): Promise<void> {
    const current = await columnsOf(dbPool, TABLE);
    if (!current.includes(DEAD_COLUMN)) {
      await dropLeftovers(dbPool);
      return; // 幂等：列已摘除
    }

    // 闸门：列里若意外出现数据则中止，避免静默丢值（当前实测 0 行）
    const [valuedRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE \`${DEAD_COLUMN}\` IS NOT NULL`,
    );
    const valued = Number(valuedRows[0]?.n ?? 0);
    if (valued > 0) {
      throw new Error(
        `buyer.${DEAD_COLUMN} 仍有 ${valued} 行有值，需先确认是否另作归档再执行 043`,
      );
    }

    const [beforeRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n, COALESCE(MAX(\`buyer_id\`), 0) AS maxId FROM \`${TABLE}\``,
    );
    const rowsBefore = Number(beforeRows[0]?.n ?? 0);
    const maxIdBefore = Number(beforeRows[0]?.maxId ?? 0);
    const nextId = maxIdBefore + 1;

    await dropLeftovers(dbPool);

    // 1) 复制结构（含 3 个索引、表注释）→ 删列
    await dbPool.query(`CREATE TABLE \`${NEW_TABLE}\` LIKE \`${TABLE}\``);
    await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`${DEAD_COLUMN}\``);

    // 2) 全列显式拷贝：buyer_id 原值带入，保住 notice_public / buyer_alias / buyer_candidate 的引用
    const copyCols = (await columnsOf(dbPool, NEW_TABLE))
      .map((name) => `\`${name}\``)
      .join(", ");
    await dbPool.query(
      `INSERT INTO \`${NEW_TABLE}\` (${copyCols}) SELECT ${copyCols} FROM \`${TABLE}\``,
    );

    // 3) CREATE ... LIKE 不保证继承自增计数，显式回填（新实体 id 必须 > 历史最大 id）
    await dbPool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${nextId}`);

    // 4) 切换前校验：行数 / 最大 id / 实体指纹唯一数
    const [afterRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n,
              COALESCE(MAX(\`buyer_id\`), 0) AS maxId,
              COUNT(DISTINCT \`entity_key\`) AS keys_
         FROM \`${NEW_TABLE}\``,
    );
    const rowsAfter = Number(afterRows[0]?.n ?? 0);
    const maxIdAfter = Number(afterRows[0]?.maxId ?? 0);
    const keysAfter = Number(afterRows[0]?.keys_ ?? 0);
    if (rowsAfter !== rowsBefore || maxIdAfter !== maxIdBefore || keysAfter !== rowsAfter) {
      throw new Error(
        `buyer 影子表校验失败：rows ${rowsAfter}/${rowsBefore}, maxId ${maxIdAfter}/${maxIdBefore}, keys ${keysAfter}/${rowsAfter}`,
      );
    }

    // 5) 原子切换
    await dbPool.query(
      `RENAME TABLE \`${TABLE}\` TO \`${OLD_TABLE}\`, \`${NEW_TABLE}\` TO \`${TABLE}\``,
    );

    // 6) 不保留备份表（列 100% NULL，回滚=加回空列）
    await dbPool.query(`DROP TABLE \`${OLD_TABLE}\``);

    console.log(
      `[migration 043] buyer.${DEAD_COLUMN} 已摘除（${rowsAfter} 行，AUTO_INCREMENT=${nextId}）`,
    );
  },
};