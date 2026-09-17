/**
 * GET /api/notices/favorites — 我的收藏（分页，按收藏时间倒序）
 *
 * @module app/api/notices/favorites/route
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listNoticeFavorites } from "@/lib/services/notice-service";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const url = req.nextUrl;
  const limit = clampLimit(url.searchParams.get("limit"), DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * limit;
  const lang = url.searchParams.get("lang") || "";

  const { total, items } = await listNoticeFavorites({
    userId: auth.userId, limit, offset, lang: lang || null,
  });
  return NextResponse.json({ total, page, limit, list: items });
});
