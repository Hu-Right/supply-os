/**
 * POST /api/notices/:id/interest — 表达意向
 *
 * @module app/api/notices/[id]/interest/route
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { submitNoticeInterest, NoticeNotFoundError } from "@/lib/services/notice-service";
import { EC_NOTICE_NOT_FOUND } from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    const body = await req.json();
    const interestType = body.interest_type === "subscribed" ? "subscribed" : "interested";
    const note = String(body.note || "").slice(0, 500);

    try {
      await submitNoticeInterest({ userId: auth.userId, noticeId, interestType, note });
      return NextResponse.json({ success: true, interest_type: interestType }, { status: 201 });
    } catch (err) {
      if (err instanceof NoticeNotFoundError) {
        routeError(404, EC_NOTICE_NOT_FOUND, "公告不存在");
      }
      throw err;
    }
  },
);
