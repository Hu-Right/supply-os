/**
 * 迁移 052 — 服务表冗余截止时间「时区来源」标记（INSTANT 加列 + 分块回填）
 *
 * @description 背景（2026-11-18）：列表/详情读截止时间时，除 `deadline_ts` 外还需要
 *              `timezone_source`（explicit / assumed_utc / date / NULL）来决定展示口径：
 *                - 默认按北京时间（UTC+8）显示；
 *                - assumed_utc 且无时区令牌 → 按 UTC 还原原文墙上时间（不做 +8）；
 *                - date → 只出日期，不臆造 00:00。
 *              该列一直在 `notice_deadline` 辅助表里，列表查询因此多一个 LEFT JOIN。
 *              现把它冗余进服务表 `notice_public`，让列表/详情读取只依赖服务表一张表。
 *
 *              为什么不用影子表换表（2026-11-18 本地 55 万行实测）：
 *                - 影子表：整表拷贝 2GB + 重建 11 个索引，实测 335s，且多占 2GB 磁盘；
 *                - 本方案：`ADD COLUMN ... ALGORITHM=INSTANT` 只改元数据（实测 1.5s），
 *                  再按主键分块回填（实测合计约 100s）。
 *              本次只是给已有表加一个可空列，效果与换表完全一致，没有重建的必要。
 *
 *              幂等/可续跑：列已存在则跳过加列；回填只写 `timezone_source IS NULL` 的行，
 *              中断后重跑会从剩余行继续（块内按主键范围扫描）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "notice_public";
const COLUMN = "timezone_source";
/** 每块回填的主键跨度（实测每块约 3–4s；服务启动前无并发写，块大小兼顾进度与单语句时长） */
const CHUNK_SIZE = 20_000;

async function hasColumn(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function countRows(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/** 加列失败时区分「语法/引擎不支持 INSTANT」与其它错误：不支持则回退普通 ALTER */
async function addColumn(pool: Pool): Promise<void> {
  try {
    await pool.query(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${COLUMN}\` varchar(20) NULL `
        + "COMMENT '截止时间时区来源（notice_deadline.timezone_source 的冗余副本，省列表/详情 JOIN）' "
        + "AFTER `deadline_timezone`, ALGORITHM=INSTANT",
    );
    console.log(`[migration 052] 已 INSTANT 加列 ${TABLE}.${COLUMN}`);
  } catch (err) {
    // 旧版本 MySQL 不支持中间位置 INSTANT（8.0.29+ 才支持），回退普通 ALTER（重建表，慢但正确）
    console.warn(
      `[migration 052] INSTANT 加列不可用，回退普通 ALTER：${(err as Error).message}`,
    );
    await pool.query(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${COLUMN}\` varchar(20) NULL `
        + "COMMENT '截止时间时区来源（notice_deadline.timezone_source 的冗余副本，省列表/详情 JOIN）' "
        + "AFTER `deadline_timezone`",
    );
  }
}

/**
 * 分块回填：按**行数**做 keyset 分批（每批取 CHUNK_SIZE 个 notice_pk，再按首尾主键区间 UPDATE），
 * 只处理 timezone_source 仍为 NULL 的行。不能用「固定主键跨度」切块——notice_pk 来自源站 id，
 * 分布稀疏（本地实测最大 1100 万而只有 55 万行），跨度切块会切出几百个空批、耗时数十分钟。
 * 无论 notice_deadline 缺行还是 source 为 NULL，目标值都保持 NULL（与服务表口径一致）。
 */
async function backfill(pool: Pool): Promise<number> {
  const [rangeRows] = await pool.query<RowDataPacket[]>(
    "SELECT COALESCE(MIN(`notice_pk`), 0) AS minPk FROM `notice_public`",
  );
  const minPk = Number(rangeRows[0]?.minPk ?? 0);
  if (minPk <= 0) return 0;

  let lastPk = minPk - 1;
  let updated = 0;
  let batchIndex = 0;
  for (;;) {
    // keyset：取下一批主键（走主键索引，LIMIT 固定行数，不与主键跨度挂钩）
    const [batch] = await pool.query<RowDataPacket[]>(
      "SELECT `notice_pk` FROM `notice_public` WHERE `notice_pk` > ? ORDER BY `notice_pk` LIMIT ?",
      [lastPk, CHUNK_SIZE],
    );
    if (batch.length === 0) break;
    const firstPk = Number(batch[0].notice_pk);
    const toPk = Number(batch[batch.length - 1].notice_pk);
    const [res] = await pool.query(
      `UPDATE \`${TABLE}\` p
         JOIN notice_deadline d ON d.notice_pk = p.notice_pk
          SET p.\`${COLUMN}\` = d.timezone_source
        WHERE p.notice_pk >= ? AND p.notice_pk <= ?
          AND p.\`${COLUMN}\` IS NULL
          AND d.timezone_source IS NOT NULL`,
      [firstPk, toPk],
    );
    updated += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    lastPk = toPk;
    batchIndex += 1;
    if (batchIndex % 5 === 0) {
      console.log(`[migration 052] 回填进度：第 ${batchIndex} 批（pk ≤ ${toPk}），累计写入 ${updated} 行`);
    }
  }
  return updated;
}

export const migration: Migration = {
  version: 52,
  name: "notice_public_timezone_source",
  async up(dbPool: Pool): Promise<void> {
    if (!(await hasColumn(dbPool, TABLE, COLUMN))) {
      await addColumn(dbPool);
    } else {
      console.log(`[migration 052] ${TABLE}.${COLUMN} 已存在，跳过加列（继续补回填）`);
    }

    const t0 = Date.now();
    const updated = await backfill(dbPool);
    console.log(
      `[migration 052] 回填完成：本次写入 ${updated} 行，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );

    // 校验：服务表里能关联到 notice_deadline 且 source 非空的行，必须全部已回填
    const expected = await countRows(
      dbPool,
      `SELECT COUNT(*) AS n
         FROM \`${TABLE}\` p
         JOIN notice_deadline d ON d.notice_pk = p.notice_pk
        WHERE d.timezone_source IS NOT NULL`,
    );
    const actual = await countRows(
      dbPool,
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE \`${COLUMN}\` IS NOT NULL`,
    );
    if (expected !== actual) {
      throw new Error(
        `[migration 052] 回填校验失败：应非空 ${expected} 行、实际 ${actual} 行（可重跑迁移续填）`,
      );
    }
    console.log(`[migration 052] 校验通过：时区来源非空 ${actual} 行（= notice_deadline 可关联非空数）`);
  },
};
