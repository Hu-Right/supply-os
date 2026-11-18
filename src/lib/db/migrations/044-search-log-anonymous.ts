/**
 * 迁移 044 — user_search_log 支持「真实热门搜索」统计（匿名 + 归一化 + 防刷）
 *
 * @module server/db/migrations/044-search-log-anonymous
 * @description 2026-11-18 首页要按「用户真实检索行为」出热门搜索，而现表：
 *              ① 只记登录用户（user_id NOT NULL），匿名流量（大多数）完全缺席；
 *              ② 只存原始 q，没有归一化列 → 大小写/全半角/多空格同一词会裂成多组；
 *              ③ 没有「访客」维度 → 单用户反复搜一个词就能霸榜（实测 1 个账号占 51% 日志）；
 *              ④ 没有 bot 标记 → 爬虫/脚本检索污染榜单；
 *              ⑤ 没有 created_at 单列索引 → 7 天窗口聚合要全表扫。
 *
 *              本迁移只做**加法**（user_id 放宽为可空 + 5 个可空列 + 2 个索引），
 *              不删列、不改旧数据语义，历史行仍可读。
 *              隐私口径：匿名行只落 `visitor_hash`（sha256(日盐|IP|UA)），**不存原始 IP**；
 *              原始 q 对匿名行为 NULL，归一化词落 `q_norm`。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

const TABLE = "user_search_log";

/** 取列信息（是否存在 / 是否可空） */
async function columnInfo(dbPool: Pool, column: string): Promise<{ nullable: boolean } | null> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [TABLE, column],
  );
  if (rows.length === 0) return null;
  return { nullable: String(rows[0].IS_NULLABLE).toUpperCase() === "YES" };
}

export const migration: Migration = {
  version: 44,
  name: "search_log_anonymous",
  async up(dbPool: Pool): Promise<void> {
    // 1) user_id 放宽为可空：匿名检索用 visitor_hash 去重（历史行保持原值）
    const userIdCol = await columnInfo(dbPool, "user_id");
    if (userIdCol && !userIdCol.nullable) {
      await dbPool.query(
        "ALTER TABLE user_search_log MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT '发起搜索的登录用户；NULL=匿名检索（按 visitor_hash 去重）'",
      );
    }

    // 2) 新增列（全部可空，历史行不受影响）
    await ensureColumn(
      dbPool,
      TABLE,
      "visitor_hash",
      "visitor_hash char(64) DEFAULT NULL COMMENT '匿名访客哈希 sha256(日盐|IP|UA)；不存原始 IP'",
    );
    await ensureColumn(
      dbPool,
      TABLE,
      "q_norm",
      "q_norm varchar(120) DEFAULT NULL COMMENT '归一化检索词（小写/全半角/压缩空白/去高级语法），热门聚合键'",
    );
    await ensureColumn(
      dbPool,
      TABLE,
      "locale",
      "locale varchar(10) DEFAULT NULL COMMENT '检索时界面语言'",
    );
    await ensureColumn(
      dbPool,
      TABLE,
      "source",
      "source varchar(20) DEFAULT NULL COMMENT '检索来源入口（unified-search 等）'",
    );
    await ensureColumn(
      dbPool,
      TABLE,
      "is_bot",
      "is_bot tinyint(1) NOT NULL DEFAULT 0 COMMENT '疑似爬虫/脚本检索：1=计入日志但不进热门聚合'",
    );

    // 3) 窗口聚合索引：created_at（7 天窗口扫）+ (q_norm, created_at)（按词收敛）
    await ensureIndex(
      dbPool,
      TABLE,
      "idx_created",
      "ALTER TABLE user_search_log ADD INDEX idx_created (created_at)",
    );
    await ensureIndex(
      dbPool,
      TABLE,
      "idx_norm_time",
      "ALTER TABLE user_search_log ADD INDEX idx_norm_time (q_norm, created_at)",
    );

    // 4) 表注释对齐新语义（旧注释写死「仅登录用户」，已不成立）
    await dbPool.query(
      "ALTER TABLE user_search_log COMMENT = '公告搜索行为日志。(登录+匿名去标识化；首页热门搜索聚合源)'",
    );
  },
};
