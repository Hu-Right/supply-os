/**
 * POST /api/notices/:id/unlock — 解锁公告（带限流）
 *
 * @module app/api/notices/[id]/unlock/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { executeUnlock, NoticeNotFoundError, QuotaExceededError } from "@/lib/services/notice-actions";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";
import { MembershipRepo } from "@/lib/repos/membership.repo";

const ApiErrorCode = {
  USER_REQUIRED: 40001,
  NOTICE_NOT_FOUND: 40006,
  FREE_LIMIT_REACHED: 41001,
  PAID_QUOTA_REQUIRED: 41002,
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

  const rateLimitResponse = checkRateLimit(req, {
    windowMs: 60_000,
    maxAttempts: 30,
  }, () => `unlock:${auth.userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const noticeId = Number(id);
  const pool = getPool();
  const userId = auth.userId!;
  const body = await req.json();
  const unlockType = body.unlock_type === "subscription" || body.unlock_type === "single"
    ? body.unlock_type : "free";

  let price = 0;
  if (unlockType === "single") {
    const membershipRepo = new MembershipRepo(pool);
    const plans = await membershipRepo.findActivePlans();
    const singlePlan = plans.find((p) => p.plan_type === "single");
    price = Number(singlePlan?.price || 0);
  }

  try {
    const result = await executeUnlock(
      {
        detailRepo: new NoticeDetailRepo(pool),
        unlockRepo: new NoticeUnlockRepo(pool),
        dbPool: pool,
        membershipRepo: new MembershipRepo(pool),
      },
      { userId, noticeId, unlockType, price },
    );
    if (result.alreadyUnlocked) {
      return NextResponse.json({ success: true, alreadyUnlocked: true });
    }
    return NextResponse.json({ success: true, unlock_type: result.unlockType }, { status: 201 });
  } catch (err) {
    if (err instanceof NoticeNotFoundError) {
      return sendError("公告不存在", 404, ApiErrorCode.NOTICE_NOT_FOUND);
    }
    if (err instanceof QuotaExceededError) {
      const code = err.code === "FREE_LIMIT_REACHED" ? ApiErrorCode.FREE_LIMIT_REACHED : ApiErrorCode.PAID_QUOTA_REQUIRED;
      const message = err.code === "FREE_LIMIT_REACHED" ? "免费查看次数已用完" : "付费查看次数已用完";
      return sendError(message, 402, code);
    }
    throw err;
  }
}
