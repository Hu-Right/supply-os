/**
 * GET /api/notices/stats — 公告统计数据
 *
 * @module app/api/notices/stats/route
 * @description 薄壳（route 仅编排调用）：六路 COUNT 与今日/昨日同期新增的
 *              SQL 口径全部在 lib/services/notice-search（与首页 ISR 服务端
 *              直出共用同一份，2026-10 从本路由下沉，禁止在路由内写业务 SQL）。
 *              公开聚合数据：HTTP 层缓存 10 分钟（与服务端统计缓存同口径）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeStats, getNoticeDailyNew } from "@/lib/services/notice-search";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const pool = getPool();
  const stats = await getNoticeStats(pool);
  // 今日新增基于 create_time Unix 时间戳，按北京时间自然日切窗（口径见 stats.ts）
  let todayNew = 0;
  let yesterdayNew = 0;
  try {
    const daily = await getNoticeDailyNew(pool);
    todayNew = daily.todayNew;
    yesterdayNew = daily.yesterdayNew;
  } catch {
    // 每日新增取不到不阻断整块统计：规模条按零值渲染（原口径不变）
  }
  // 不直接往 stats 上写：getNoticeStats 命中时返回的是共享缓存对象，
  // 就地改会让同进程后续请求读到上一轮的每日新增（跨请求脏写）。
  return NextResponse.json({ ...stats, todayNew, yesterdayNew }, { headers: { "Cache-Control": "public, max-age=600" } });
});
