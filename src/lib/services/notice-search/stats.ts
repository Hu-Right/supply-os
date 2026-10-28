/**
 * 公采池统计
 * Notice pool statistics
 *
 * @module server/services/notice-search/stats
 * @description 首页规模条的六路 COUNT 统计（10 分钟内存缓存 + 请求级锁）。
 *
 *              2026-10-15 审计收刀：crm_notice_stats 预计算表管线（refreshNoticeStats/
 *              statsKeyFor/getStatsCount，warmup + 10 分钟定时器喂养、每轮 ~102 键逐键 upsert）
 *              在旧搜索管道退役后已无任何读取方——getNoticeStats 从不查统计表，直接 COUNT。
 *              整条管线与内存 count/featured/noticeType 缓存四件套一并删除；
 *              crm_notice_stats 表随 DDL 批次 DROP。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { NoticeStatsResult } from "./types";
import { ACTIVE_NOTICE_WHERE_NO_ALIAS } from "../../utils/notice-expired";

// ── 统计缓存 + 请求级锁 ──
let noticeStatsCache: { data: NoticeStatsResult; expires: number } | null = null;
/** 请求级锁：防止并发请求同时触发多轮 6 查询，只允许一个请求计算，其余等待结果 */
let statsCalcPromise: Promise<NoticeStatsResult> | null = null;

/** 获取公采池统计数据 — 串行执行 + 请求级锁，避免并发重复计算压垮数据库 */
export function getNoticeStats(pool: Pool): Promise<NoticeStatsResult> {
  // 缓存命中直接返回
  if (noticeStatsCache && noticeStatsCache.expires > Date.now()) {
    return Promise.resolve(noticeStatsCache.data);
  }
  // 已有计算在进行中，复用其 Promise（请求级锁）
  if (statsCalcPromise) return statsCalcPromise;

  statsCalcPromise = (async () => {
    try {
      const [rawRows] = await pool.query("SELECT COUNT(*) AS total FROM bid_notices n");
      const [activeRows] = await pool.query(`SELECT COUNT(*) AS total FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS}`);
      const [bridgedRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS}
         AND EXISTS (SELECT 1 FROM notice_backbone_nodes b WHERE b.notice_id = n.id)`
      );
      const [featuredRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE_NO_ALIAS} AND n.is_featured = 1`
      );
      // 模块02 规模条口径（谓词字面内联以通过静态扫描，与 ACTIVE_NOTICE_WHERE_NO_ALIAS
      // 逐字一致，口径变更须与 utils/notice-expired 两处同步）：
      // 未来 30 天截止（把握近期机会）
      const [deadline30Rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM bid_notices n
         WHERE (n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
           AND n.deadline_sec > UNIX_TIMESTAMP(NOW())
           AND n.deadline_sec <= UNIX_TIMESTAMP(NOW()) + 30 * 86400
           AND (n.entry_source <> 'platform' OR IFNULL(n.rfq_status, '') = ${JSON.stringify(RFQ_STATUS.PUBLISHED)})`
      );
      // 含原始文件（宽表 documents_count>0，可下载附件）
      const [docsRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM notice_search ns
         WHERE (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))
           AND ns.documents_count > 0`
      );
      const active = Number((activeRows as RowDataPacket[])[0]?.total || 0);
      const bridged = Number((bridgedRows as RowDataPacket[])[0]?.total || 0);
      const data: NoticeStatsResult = {
        raw: Number((rawRows as RowDataPacket[])[0]?.total || 0), active, bridged,
        featured: Number((featuredRows as RowDataPacket[])[0]?.total || 0), bridgeGap: active - bridged,
        deadlineIn30d: Number((deadline30Rows as RowDataPacket[])[0]?.total || 0),
        withOriginalDocs: Number((docsRows as RowDataPacket[])[0]?.total || 0),
      };
      noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
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
