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
  return NextResponse.json(stats);
}
