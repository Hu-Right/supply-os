/**
 * GET /api/notices/favorites/ids — 用户已收藏公告 id 集合（轻量状态回显）
 *
 * @module app/api/notices/favorites/ids/route
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listNoticeFavoriteIds } from "@/lib/services/notice-service";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ids = await listNoticeFavoriteIds(auth.userId);
  return NextResponse.json({ ids });
});
