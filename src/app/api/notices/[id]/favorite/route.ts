/**
 * POST /api/notices/[id]/favorite — 收藏/取消收藏（toggle）
 *
 * @module app/api/notices/[id]/favorite/route
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { toggleNoticeFavorite, NoticeNotFoundError } from "@/lib/services/notice-service";
import { EC_NOTICE_NOT_FOUND } from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    try {
      const result = await toggleNoticeFavorite({ userId: auth.userId, noticeId: Number(id) });
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof NoticeNotFoundError) {
        routeError(404, EC_NOTICE_NOT_FOUND, "公告不存在");
      }
      throw err;
    }
  },
);
