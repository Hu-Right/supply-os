/**
 * 截止语义分类「补漏」——把尚未分类的公告跑一遍 classifyDeadline 并回写三处。
 *
 * 背景：入库链路只写 bid_notices，不产出 notice_deadline；历史存量靠一次性回填脚本补齐，
 * 但新公告会持续漏分类（漏了就走 `deadline_sec > 0 ? known : unknown` 的老兜底，
 * 绕过哨兵/框架 30 年/年份笔误等保护规则）。本函数供定时任务调用，逐轮把缺口收敛到 0。
 *
 * 唯一规则实现仍在 classify.ts；本文件只负责取数、批量落库与生效链
 * （notice_deadline 旁表 → rebuildPublicRowsByIds 服务表重建 → syncWideIds 宽表跟进）。
 */
import type { Pool } from "mysql2/promise";
import { classifyDeadline } from "./classify";
import { rebuildPublicRowsByIds } from "../notice-public/rebuild";
import { syncWideIds } from "../search-sync/sync-scheduler";

export interface ClassifyMissingResult {
  /** 本轮实际分类的条数 */
  classified: number;
  /** 按 state 计数 */
  byState: Record<string, number>;
}

/**
 * @param pool  数据库连接池
 * @param options.limit 单轮最多处理条数（默认 3000，上限 20000，避免单轮长事务）
 */
export async function classifyMissingDeadlines(
  pool: Pool,
  options: { limit?: number } = {},
): Promise<ClassifyMissingResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 3000, 20_000));
  const byState: Record<string, number> = {};

  const [idRows] = await pool.query(
    `SELECT p.notice_pk AS id
       FROM notice_public p
       LEFT JOIN notice_deadline d ON d.notice_pk = p.notice_pk
      WHERE d.notice_pk IS NULL
      ORDER BY p.notice_pk
      LIMIT ?`,
    [limit],
  );
  const ids = (idRows as Array<{ id: number }>).map((r) => Number(r.id));
  if (!ids.length) return { classified: 0, byState };

  const [rows] = await pool.query(
    `SELECT n.id, n.deadline, n.deadline_ts, n.published_date, n.country,
            LEFT(n.title, 300) AS title, LEFT(n.description, 2000) AS description
       FROM bid_notices n
      WHERE n.id IN (?)`,
    [ids],
  );
  const batch = rows as Array<Record<string, unknown>>;
  if (!batch.length) return { classified: 0, byState };

  const values: unknown[][] = [];
  for (const r of batch) {
    const v = classifyDeadline({
      deadline: (r.deadline as string | null) ?? null,
      deadlineTs: (r.deadline_ts as number | null) ?? null,
      publishedDate: (r.published_date as string | null) ?? null,
      title: (r.title as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      country: (r.country as string | null) ?? null,
    });
    byState[v.state] = (byState[v.state] ?? 0) + 1;
    values.push([r.id, v.state, v.type, v.effectiveTs, v.confidence, v.timezone ?? null, v.timezoneSource ?? null]);
  }

  await pool.query(
    `INSERT INTO notice_deadline
       (notice_pk, deadline_state, deadline_type, effective_ts, confidence, deadline_timezone, timezone_source)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       deadline_state=VALUES(deadline_state), deadline_type=VALUES(deadline_type),
       effective_ts=VALUES(effective_ts), confidence=VALUES(confidence),
       deadline_timezone=VALUES(deadline_timezone), timezone_source=VALUES(timezone_source)`,
    [values],
  );

  // 落库后不直写服务表/宽表（红线：notice_public 与 notice_search 均为单一写入者）：
  // 服务表截止列（deadline_state/type/timezone/deadline_ts）本就是 buildPublicRow
  // LEFT JOIN notice_deadline 的投影，按 id 交回唯一写入者重建；宽表再经 syncWideIds 跟进。
  const classifiedIds = batch.map((r) => Number(r.id));
  await rebuildPublicRowsByIds(pool, classifiedIds);
  await syncWideIds(pool, classifiedIds);

  return { classified: classifiedIds.length, byState };
}
