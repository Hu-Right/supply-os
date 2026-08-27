/**
 * POST /api/notices/:id/interest — 表达意向
 *
 * @module app/api/notices/[id]/interest/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { submitInterest, NoticeNotFoundError } from "@/lib/services/notice-actions";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeInteractionRepo } from "@/lib/repos/notices/notice-interaction.repo";

const ApiErrorCode = {
  USER_REQUIRED: 40001,
  NOTICE_NOT_FOUND: 40006,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const noticeId = Number(id);
  const userKey = auth.userKey;
  const body = await req.json();
  const interestType = body.interest_type === "subscribed" ? "subscribed" : "interested";
  const note = String(body.note || "").slice(0, 500);

  if (!userKey) return sendError("请先登录", 400, ApiErrorCode.USER_REQUIRED);

  const pool = getPool();

  try {
    await submitInterest(
      {
        detailRepo: new NoticeDetailRepo(pool),
        interactionRepo: new NoticeInteractionRepo(pool),
        dbPool: pool,
      },
      { userKey, noticeId, interestType, note },
    );
    return NextResponse.json({ success: true, interest_type: interestType }, { status: 201 });
  } catch (err) {
    if (err instanceof NoticeNotFoundError) {
      return sendError("公告不存在", 404, ApiErrorCode.NOTICE_NOT_FOUND);
    }
    throw err;
  }
}
