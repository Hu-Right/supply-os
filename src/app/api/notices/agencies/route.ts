/**
 * GET /api/notices/agencies — 机构列表（带公告计数 + i18n 翻译）
 *
 * @module app/api/notices/agencies/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeAgencies } from "@/lib/services/notice-search";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase()
    || req.nextUrl.searchParams.get("locale")?.toLowerCase()
    || "en";
  try {
    const pool = getPool();
    const agencies = await getNoticeAgencies(pool, lang);
    return NextResponse.json(agencies, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err) {
    console.error("[agencies] 获取机构列表失败:", (err as Error).message);
    return NextResponse.json([], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  }
}
