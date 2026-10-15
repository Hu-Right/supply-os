/**
 * GET /api/notices/hot-topics — 首页热门话题（国家 / 品目大类，带有效公告计数）
 *
 * @module app/api/notices/hot-topics/route
 * @description 规划 §5.1 内容模块 + §7.3 数量 SEO：热门国家、热门品目大类各 TOP8，
 *              均带真实结果数（大类计数与点进去的检索谓词同一包含关系）。
 *              服务端 10 分钟内存缓存，响应层再加 10 分钟 HTTP 缓存
 *              （与 industries 下拉口径一致）。名字不在这里拼：返回的是大类码，
 *              展示名随 SQL 带出 name_zh（树是名称唯一事实源）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getHotTopics } from "@/lib/services/notice-search";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const pool = getPool();
  const data = await getHotTopics(pool);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=600" } });
});
