/**
 * GET /api/notices/agencies — 机构列表（带公告计数 + i18n 翻译）
 *
 * @module app/api/notices/agencies/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeAgencies } from "@/lib/services/notice-search";
import { toCamelKeys } from "@/lib/services/notice-public/view";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase()
    || req.nextUrl.searchParams.get("locale")?.toLowerCase()
    || "en";
  try {
    const pool = getPool();
    const agencies = await getNoticeAgencies(pool, lang);
    // 行形状经通用改名后对外（`agency_i18n` → `agencyI18n`，红线②）；
    // 内部 i18n 缓存与搜索行仍保持列名，不在本层依赖下游改名。
    return NextResponse.json(agencies.map(toCamelKeys), {
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
});
