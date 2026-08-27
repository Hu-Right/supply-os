/**
 * GET /api/notices/search — 已废弃
 *
 * @module app/api/notices/search/route
 * @description 统一搜索已迁移到 /api/notices/unified-search/route.ts。
 *              此文件仅返回 410 Gone 引导调用方迁移。
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { code: 40410, message: "Gone — use /api/notices/unified-search instead." },
    { status: 410 },
  );
}
