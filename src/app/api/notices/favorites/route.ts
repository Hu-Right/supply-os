/**
 * GET /api/notices/favorites — 我的收藏（分页，按收藏时间倒序）
 *
 * @module app/api/notices/favorites/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listNoticeFavorites } from "@/lib/services/notice-service";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { canReadNoticeTranslation, maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";
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
  // 收藏列表项与搜索列表同形制，同样先过 view mapper（红线②）；
  // 译文按权益下发（2026-11-24 口径 A+3）：与列表/详情同口径，无权益只有原文。
  const list = toNoticeListView(items);
  if (!(await canReadNoticeTranslation(getContext().benefitSystemRepo, auth.userId))) {
    maskTranslationFieldList(list);
  }
  return NextResponse.json({ total, page, limit, list });
});
