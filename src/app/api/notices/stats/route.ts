/**
 * GET /api/notices/stats — 公告统计数据
 *
 * @module app/api/notices/stats/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeStats } from "@/lib/services/notice-search";
import { withRoute } from "@/lib/middleware/route-handler";

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

export const GET = withRoute(async () => {
  const pool = getPool();
  const stats = await getNoticeStats(pool);
  // 追加今日/昨日同期新增公告数（基于 create_time Unix 时间戳，北京时间自然日 00:00 切分，
  // 24:00 归零重开；昨日取与今日已流逝等长的同期窗口，保证环比在一天内任意时刻可比）
  try {
    const todayStr = getBeijingDate();
    const todayStart = beijingDateToUnix(todayStr, 0);                    // 今天 00:00
    const todayEnd = beijingDateToUnix(getBeijingDateOffset(1), 0);       // 明天 00:00（今日 24:00）
    const elapsedSec = Math.max(0, Math.floor(Date.now() / 1000) - todayStart);
    const yesterdayStart = beijingDateToUnix(getBeijingDateOffset(-1), 0); // 昨天 00:00
    const yesterdayEnd = yesterdayStart + elapsedSec;                      // 昨天 same time

    const [todayResult, yesterdayResult] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE create_time >= ? AND create_time < ?",
        [todayStart, todayEnd]
      ),
      pool.query(
        "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE create_time >= ? AND create_time < ?",
        [yesterdayStart, yesterdayEnd]
      ),
    ]);
    // pool.query 返回 [rows, fields]，取 rows[0].total
    (stats as any).todayNew = Number((todayResult[0] as any[])?.[0]?.total || 0);
    (stats as any).yesterdayNew = Number((yesterdayResult[0] as any[])?.[0]?.total || 0);
  } catch {
    (stats as any).todayNew = 0;
    (stats as any).yesterdayNew = 0;
  }
  return NextResponse.json(stats);
});
