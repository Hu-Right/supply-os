/**
 * POST /api/opportunities/:id/unlock — 商机解锁（带限流 + entitlement 校验）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { normalizeUnspscCodes } from "@/lib/services/unspsc/parser";
import { persistUserInterestCodes } from "@/lib/services/unspsc/interest";

const ApiErrorCode = {
  FREE_LIMIT_REACHED: 41001,
  PAID_QUOTA_REQUIRED: 41002,
  OPPORTUNITY_NOT_FOUND: 40403,
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

  const rateLimitResponse = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `opp_unlock:${auth.userKey}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const opportunityId = Number(id);
  const ctx = getContext();
  const { opportunitiesRepo: oppsRepo, dbPool } = ctx;
  const membershipRepo = ctx.payment.membershipRepo;

  const body = await req.json();
  const unlockType = body.unlock_type === "subscription" || body.unlock_type === "single"
    ? body.unlock_type : "free";

  let price = 0;
  if (unlockType === "single") {
    const plans = await membershipRepo.findActivePlans();
    const singlePlan = plans.find((p) => p.plan_type === "single");
    price = Number(singlePlan?.price || 0);
  }

  const existing = await oppsRepo.findExistingUnlock(auth.userKey, opportunityId);
  if (existing) return NextResponse.json({ success: true, alreadyUnlocked: true });

  if (unlockType === "free") {
    const freeQuota = await membershipRepo.getFreeQuota();
    if (await membershipRepo.countFreeUnlocks(auth.userKey) >= freeQuota) {
      return sendError("免费查看次数已用完", 402, ApiErrorCode.FREE_LIMIT_REACHED);
    }
  }

  if (unlockType === "subscription" || unlockType === "single") {
    const activeEntitlements = await membershipRepo.findActiveEntitlements(auth.userKey);
    if (activeEntitlements.length === 0) {
      return sendError("付费查看次数已用完，请开通会员", 402, ApiErrorCode.PAID_QUOTA_REQUIRED);
    }
  }

  const opp = await oppsRepo.findById(opportunityId);
  if (!opp) return sendError("机会不存在", 404, ApiErrorCode.OPPORTUNITY_NOT_FOUND);
  const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

  await oppsRepo.insertUnlock({ userKey: auth.userKey, opportunityId, unlockType, price, unspscSnapshot: JSON.stringify(snapshot) });
  await oppsRepo.incrementUnlockCount(opportunityId);
  await persistUserInterestCodes(dbPool, auth.userKey, snapshot, "unlock_order", 2.50).catch(() => {});

  return NextResponse.json({ success: true, unlock_type: unlockType }, { status: 201 });
}
