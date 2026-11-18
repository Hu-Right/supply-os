/**
 * 迁移 055 — 服务表 industry 列语义更正（采购主题 canonical slug）
 *
 * @description 2026-11-18 决策：剔除「采购主题 slug → GB/T 行业门类」桥接。
 *              build.ts 不再把 bid_notices.industry（engineering/medical/...）映射成
 *              industry_nodes 的 UGT-I 门类码，只写 canonical slug（或 NULL）；
 *              展示层用采购类别标签（shared/utils/industry-section）。
 *
 *              本迁移只更正列注释（纯元数据，不动类型/数据/索引）；
 *              历史脏数据（已写入的 UGT-I 码）由 scripts/tools/notice-public-normalize-industry.ts
 *              通过 build.ts 的唯一写入者函数清理。
 *
 *              MySQL 8.0.46 实测列注释变更支持 ALGORITHM=INSTANT；
 *              幂等：当前注释已一致则跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "notice_public";
const COLUMN = "industry";
const DEFINITION = "varchar(100) DEFAULT NULL";
const COMMENT =
  "采购主题 canonical slug（34 值：engineering/medical/building…；2026-11-18 起不再映射行业树码，展示层用采购类别标签）";

async function currentComment(pool: Pool): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_COMMENT AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [TABLE, COLUMN],
  );
  return rows[0]?.c ?? null;
}

export const migration: Migration = {
  version: 55,
  name: "notice-public-industry-comment",

  async up(dbPool: Pool): Promise<void> {
    const existing = await currentComment(dbPool);
    if (existing === COMMENT) {
      console.log(`[migration 055] 跳过 ${TABLE}.${COLUMN}（注释已一致）`);
      return;
    }
    try {
      await dbPool.query(
        `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${COLUMN}\` ${DEFINITION} COMMENT ?, ALGORITHM=INSTANT`,
        [COMMENT],
      );
    } catch (err) {
      console.warn(`[migration 055] INSTANT 不可用，回退普通 ALTER：${(err as Error).message}`);
      await dbPool.query(
        `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${COLUMN}\` ${DEFINITION} COMMENT ?`,
        [COMMENT],
      );
    }
    console.log(`[migration 055] 已更新注释 ${TABLE}.${COLUMN}`);
  },
};
