/**
 * 迁移 053 — 补齐截止时间时区列注释（纯注释，不改类型/数据）
 *
 * @description 时区口径三层分工需要写进列注释，否则读代码/库的人会误以为
 *              `bid_opportunities.deadline_timezone`（原始自由文本）与
 *              `notice_deadline.deadline_timezone`（可计算令牌）是同一种东西。
 *
 *              本次只改列注释（COMMENT），不动类型、可空性、数据与索引。
 *              MySQL 8.0.46 实测：列注释变更支持 ALGORITHM=INSTANT（纯元数据，0.01s），
 *              因此可在部署 bootstrap（应用停机）直接执行；显式指定 INSTANT，
 *              不被支持时回退普通 ALTER 并告警（老版本会重建表，慢但正确）。
 *              幂等：当前注释与目标一致时跳过。
 *
 *              口径文档：docs/notice-deadline-timezone.md
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

interface CommentTarget {
  table: string;
  column: string;
  /** 必须与基线一致的类型定义（MODIFY COLUMN 会重写整列定义，漏写可空性/默认值会改坏表） */
  definition: string;
  comment: string;
}

/** 目标列注释（唯一事实源：与 db/schema/baseline.sql 同文） */
const TARGETS: CommentTarget[] = [
  {
    table: "bid_opportunities",
    column: "deadline_timezone",
    definition: "varchar(200) DEFAULT NULL",
    comment:
      "截止时间时区（原始抓取层：自由文本，可能含页面时区注释；不可计算令牌，展示/解析只认语义层 notice_deadline.deadline_timezone）",
  },
  {
    table: "notice_deadline",
    column: "deadline_timezone",
    definition: "varchar(64) DEFAULT NULL",
    comment:
      "截止时间时区令牌（语义层：仅 GMT±HH:MM / UTC / IANA Area/City，禁止自由文本；无令牌为 NULL）",
  },
  {
    table: "notice_deadline",
    column: "timezone_source",
    definition: "varchar(20) DEFAULT NULL",
    comment:
      "时区来源：explicit=源含可计算令牌 / assumed_utc=源仅墙上时分按 UTC 存 / date=仅日期 / NULL=未知",
  },
  {
    table: "notice_public",
    column: "deadline_timezone",
    definition: "varchar(64) DEFAULT NULL",
    comment:
      "截止时间时区令牌（服务表投影：仅 GMT±HH:MM / UTC / IANA Area/City，禁止自由文本；无令牌为 NULL）",
  },
  {
    table: "notice_public",
    column: "timezone_source",
    definition: "varchar(20) DEFAULT NULL",
    comment:
      "时区来源（notice_deadline.timezone_source 冗余副本）：explicit / assumed_utc / date / NULL；决定展示是否 +8、是否只出日期",
  },
];

async function currentComment(pool: Pool, table: string, column: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_COMMENT AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  if (rows.length === 0) return null;
  return String(rows[0].c ?? "");
}

export const migration: Migration = {
  version: 53,
  name: "notice_timezone_column_comments",
  async up(dbPool: Pool): Promise<void> {
    // 防被长事务/空闲连接拖住：拿不到元数据锁时 60s 内失败并给出明确报错，
    // 而不是无限期停在「Waiting for table metadata lock」。
    await dbPool.query("SET SESSION lock_wait_timeout = 60");
    for (const target of TARGETS) {
      const existing = await currentComment(dbPool, target.table, target.column);
      if (existing === null) {
        console.log(`[migration 053] 跳过 ${target.table}.${target.column}（列不存在）`);
        continue;
      }
      if (existing === target.comment) {
        console.log(`[migration 053] 跳过 ${target.table}.${target.column}（注释已一致）`);
        continue;
      }
      const t0 = Date.now();
      try {
        await dbPool.query(
          `ALTER TABLE \`${target.table}\` MODIFY COLUMN \`${target.column}\` ${target.definition} COMMENT ?, ALGORITHM=INSTANT`,
          [target.comment],
        );
      } catch (err) {
        console.warn(
          `[migration 053] ${target.table}.${target.column} INSTANT 不可用，回退普通 ALTER（可能重建表）：${(err as Error).message}`,
        );
        await dbPool.query(
          `ALTER TABLE \`${target.table}\` MODIFY COLUMN \`${target.column}\` ${target.definition} COMMENT ?`,
          [target.comment],
        );
      }
      console.log(
        `[migration 053] 已更新注释 ${target.table}.${target.column}（${((Date.now() - t0) / 1000).toFixed(2)}s）`,
      );
    }
  },
};
