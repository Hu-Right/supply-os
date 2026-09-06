/**
 * GET /api/notices/hot-topics — 首页热门话题（国家/行业/UNSPSC 代码，带有效公告计数）
 *
 * @module app/api/notices/hot-topics/route
 * @description 规划 §5.1 内容模块 + §7.3 数量 SEO：热门国家、热门行业、UNSPSC
 *              热门代码各 TOP8，均带真实结果数。服务端 10 分钟内存缓存，
 *              响应层再加 10 分钟 HTTP 缓存（与 industries 下拉口径一致）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getHotTopics } from "@/lib/services/notice-search";

export async function GET() {
  const pool = getPool();
  const data = await getHotTopics(pool);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=600" } });
}
