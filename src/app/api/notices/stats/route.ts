/**
 * GET /api/notices/stats — 公告统计数据
 *
 * @module app/api/notices/stats/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeStats } from "@/lib/services/notice-search";

export async function GET() {
  const pool = getPool();
  const stats = await getNoticeStats(pool);
  // 追加今日新增公告数（基于 create_time）
  try {
    const [todayRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE DATE(create_time) = CURDATE()"
    );
    (stats as any).todayNew = Number((todayRows as any[])[0]?.total || 0);
  } catch {
    (stats as any).todayNew = 0;
  }
  return NextResponse.json(stats);
}
