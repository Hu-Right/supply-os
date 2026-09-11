/**
 * GET /api/notices/stats — 公告统计数据
 *
 * @module app/api/notices/stats/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeStats } from "@/lib/services/notice-search";

/** 北京时间偏移量（毫秒） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 计算北京时间某日 10:00 的 Unix 时间戳（秒）
 * create_time 字段存储的是 Unix 时间戳（秒），每日切分点为北京时间 10:00
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

export async function GET() {
  const pool = getPool();
  const stats = await getNoticeStats(pool);
  // 追加今日/昨日新增公告数（基于 create_time Unix 时间戳，北京时间 10:00 切分）
  try {
    const todayStr = getBeijingDate();
    const yesterdayStr = getBeijingDateOffset(-1);
    const dayBeforeYesterdayStr = getBeijingDateOffset(-2);
    const todayEnd = beijingDateToUnix(todayStr, 10);            // 今天 10:00
    const todayStart = beijingDateToUnix(yesterdayStr, 10);      // 昨天 10:00
    const yesterdayStart = beijingDateToUnix(dayBeforeYesterdayStr, 10); // 前天 10:00

    const [todayResult, yesterdayResult] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE create_time >= ? AND create_time < ?",
        [todayStart, todayEnd]
      ),
      pool.query(
        "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE create_time >= ? AND create_time < ?",
        [yesterdayStart, todayStart]
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
}
