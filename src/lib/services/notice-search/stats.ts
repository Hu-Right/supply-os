/**
 * 公采池统计
 * Notice pool statistics
 *
 * @module server/services/notice-search/stats
 * @description 首页规模条 / 采购列表规模条的六路 COUNT 统计（10 分钟内存缓存 + 请求级锁）。
 *
 *              2026-10-15 审计收刀：crm_notice_stats 预计算表管线（refreshNoticeStats/
 *              statsKeyFor/getStatsCount，warmup + 10 分钟定时器喂养、每轮 ~102 键逐键 upsert）
 *              在旧搜索管道退役后已无任何读取方——getNoticeStats 从不查统计表，直接 COUNT。
 *              整条管线与内存 count/featured/noticeType 缓存四件套一并删除；
 *              crm_notice_stats 表随 DDL 批次 DROP。
 *
 *              2026-11-18「机会总量改读服务表」（用户拍板，实测收益）：
 *              旧实现 active 在 100 万行的 bid_notices 上用
 *              `deadline_sec IS NULL OR = 0 OR >= now` + entry_source/rfq_status 过滤 → 优化器
 *              放弃索引（type=ALL，实测 29~40s），只有 10 分钟缓存兜着，缓存冷启动/重启时
 *              接口就会超时。现改为读 55 万行的 notice_public，同一谓词可走 idx_deadline
 *              纯索引扫描（实测 150~200ms，约 180 倍），且服务表本来就是「用户实际能搜到/
 *              点开的机会」，与首页文案一致（与主表口径差约 0.4%，来自准入/截止解析补全）。
 *              · active / bridged / deadlineIn30d 统一读 notice_public（同一「机会池」口径，
 *                bridgeGap 才有意义；notice_backbone_nodes.notice_id ↔ notice_pk）；
 *              · featured 读服务表预计算列 `is_opportunity`（该列定义即
 *                「1=is_featured 或关联合格/在架/过审商机」，与首页热门商机 featured=1 的
 *                检索口径同源）；为此补了复合索引 idx_np_opportunity(is_opportunity, deadline_ts)
 *                （迁移 045），实测毫秒级（加索引前该 COUNT 15.6s 全表扫）；
 *              · withOriginalDocs 保持宽表口径，改为 `documents_count > 0` 先行；
 *              · raw（主表总行数）与「今日新增」（create_time 北京时间自然日）保持主表口径：
 *                每日新增走 idx_create_time 仅 34ms，且服务表没有 create_time，换源会改变语义。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { NoticeStatsResult } from "./types";
import { CACHE_TTL_MEDIUM_MS } from "@/shared/constants/time";

// ── 统计缓存 + 请求级锁 ──
let noticeStatsCache: { data: NoticeStatsResult; expires: number } | null = null;
/** 请求级锁：防止并发请求同时触发多轮 6 查询，只允许一个请求计算，其余等待结果 */
let statsCalcPromise: Promise<NoticeStatsResult> | null = null;

/** 服务表「有效机会」谓词：无截止/截止为 0/未过期（与 notice_public.deadline_ts 口径对齐） */
const PUBLIC_ACTIVE = "(p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP(NOW()))";

/** 取 COUNT 查询的唯一值（查询结果固定为 [{ total }]） */
function countOf(result: [unknown, unknown]): number {
  const rows = result[0] as RowDataPacket[] | undefined;
  return Number(rows?.[0]?.total || 0);
}

/** 获取公采池统计数据 — 六路查询并行执行 + 请求级锁，避免并发重复计算压垮数据库 */
export function getNoticeStats(pool: Pool): Promise<NoticeStatsResult> {
  // 缓存命中直接返回
  if (noticeStatsCache && noticeStatsCache.expires > Date.now()) {
    return Promise.resolve(noticeStatsCache.data);
  }
  // 已有计算在进行中，复用其 Promise（请求级锁）
  if (statsCalcPromise) return statsCalcPromise;

  statsCalcPromise = (async () => {
    try {
      const [
        rawResult,
        activeResult,
        bridgedResult,
        featuredResult,
        deadline30Result,
        docsResult,
      ] = await Promise.all([
        // 1) 主表总行数（raw 指标，语义不变；COUNT(*) 走最小索引，实测 ~190ms）
        pool.query("SELECT COUNT(*) AS total FROM bid_notices"),
        // 2) 有效机会总量：服务表 + idx_deadline 纯索引扫描（实测 ~150ms，原主表全表扫 ~29s）
        pool.query(`SELECT COUNT(*) AS total FROM notice_public p WHERE ${PUBLIC_ACTIVE}`),
        // 3) 已挂骨架节点（bridged）：与 active 同一服务表口径，bridgeGap = active - bridged
        pool.query(
          `SELECT COUNT(*) AS total FROM notice_public p
            WHERE ${PUBLIC_ACTIVE}
              AND EXISTS (SELECT 1 FROM notice_backbone_nodes b WHERE b.notice_id = p.notice_pk)`,
        ),
        // 4) 精选/商机集合：服务表预计算列 is_opportunity（迁移 045 补的复合索引，实测毫秒级）
        //    注意该列语义是「is_featured 或关联合格/在架/过审商机」，与首页热门商机同源
        pool.query(
          `SELECT COUNT(*) AS total FROM notice_public p
            WHERE p.is_opportunity = 1
              AND ${PUBLIC_ACTIVE}`,
        ),
        // 5) 未来 30 天截止：服务表 idx_deadline 范围扫描（实测 ~70ms；原主表写法 566ms 起）
        pool.query(
          `SELECT COUNT(*) AS total FROM notice_public p
            WHERE p.deadline_ts > UNIX_TIMESTAMP(NOW())
              AND p.deadline_ts <= UNIX_TIMESTAMP(NOW()) + 30 * 86400`,
        ),
        // 6) 含原始文件：宽表口径，documents_count 先行（实测 ~330ms）
        pool.query(
          `SELECT COUNT(*) AS total FROM notice_search ns
            WHERE ns.documents_count > 0
              AND (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))`,
        ),
      ]);

      const active = countOf(activeResult);
      const bridged = countOf(bridgedResult);
      const data: NoticeStatsResult = {
        raw: countOf(rawResult),
        active,
        bridged,
        featured: countOf(featuredResult),
        bridgeGap: active - bridged,
        deadlineIn30d: countOf(deadline30Result),
        withOriginalDocs: countOf(docsResult),
      };
      noticeStatsCache = { data, expires: Date.now() + CACHE_TTL_MEDIUM_MS };
      return data;
    } finally {
      statsCalcPromise = null;
    }
  })();

  return statsCalcPromise;
}

/** 清除统计缓存（测试辅助） */
export function clearStatsCache(): void {
  noticeStatsCache = null;
  statsCalcPromise = null;
}

// ── 今日/昨日同期新增公告数（首页数字墙 + /api/notices/stats 共用）──

/** 北京时间偏移量（毫秒） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 计算北京时间某日 00:00 的 Unix 时间戳（秒）
 * create_time 字段存储的是 Unix 时间戳（秒），每日切分点为北京时间自然日 00:00
 */
function beijingDateToUnix(dateStr: string, hour: number): number {
  const d = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`);
  return Math.floor(d.getTime() / 1000);
}

/** 获取北京时间日期字符串 YYYY-MM-DD */
function getBeijingDate(): string {
  const now = new Date(Date.now() + BEIJING_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

/** 获取偏移天数的北京时间日期字符串 */
function getBeijingDateOffset(daysOffset: number): string {
  const now = new Date(Date.now() + BEIJING_OFFSET_MS);
  now.setDate(now.getDate() + daysOffset);
  return now.toISOString().slice(0, 10);
}

/**
 * 今日新增 + 昨日同期新增（基于 create_time Unix 时间戳，北京时间自然日 00:00 切分，
 * 24:00 归零重开；昨日取与今日已流逝等长的同期窗口，保证环比在一天内任意时刻可比）。
 *
 * 2026-10 从 /api/notices/stats 路由内联 SQL 下沉：首页服务端直出（ISR）与路由
 * 必须走同一份口径，不得长出第二套切窗算法。查询失败直接抛给调用方，
 * 由调用方决定降级值（路由维持历史行为：失败时置 0）。
 *
 * 2026-11-18：保持主表口径（服务表没有 create_time；改用 published_ts 会变语义，
 * 且实测该列数据不可用）。create_time 走 idx_create_time，两次查询合计 ~35ms。
 */
export async function getNoticeDailyNew(pool: Pool): Promise<{ todayNew: number; yesterdayNew: number }> {
  const todayStr = getBeijingDate();
  const todayStart = beijingDateToUnix(todayStr, 0);                    // 今天 00:00
  const todayEnd = beijingDateToUnix(getBeijingDateOffset(1), 0);       // 明天 00:00（今日 24:00）
  const elapsedSec = Math.max(0, Math.floor(Date.now() / 1000) - todayStart);
  const yesterdayStart = beijingDateToUnix(getBeijingDateOffset(-1), 0); // 昨天 00:00
  const yesterdayEnd = yesterdayStart + elapsedSec;                      // 昨天 same time

  const [todayResult, yesterdayResult] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) AS total FROM bid_notices WHERE create_time >= ? AND create_time < ?",
      [todayStart, todayEnd]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM bid_notices WHERE create_time >= ? AND create_time < ?",
      [yesterdayStart, yesterdayEnd]
    ),
  ]);
  // pool.query 返回 [rows, fields]，取 rows[0].total
  return {
    todayNew: Number((todayResult[0] as RowDataPacket[])?.[0]?.total || 0),
    yesterdayNew: Number((yesterdayResult[0] as RowDataPacket[])?.[0]?.total || 0),
  };
}
