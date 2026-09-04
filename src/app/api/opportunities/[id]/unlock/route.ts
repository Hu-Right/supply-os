/**
 * POST /api/opportunities/:id/unlock — 商机解锁（限流 + 事务化配额消耗）
 *
 * 解锁编排收敛到 executeOpportunityUnlock（审查报告 F10）：配额消耗与
 * 解锁记录同事务，FOR UPDATE 防并发超卖，免费额度事务内复核。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { normalizeUnspscCodes } from "@/lib/services/unspsc/parser";
import { executeOpportunityUnlock, OpportunityUnlockError } from "@/lib/services/opportunity-unlock";
import {
  EC_FREE_LIMIT_REACHED, EC_PAID_QUOTA_REQUIRED, EC_OPPORTUNITY_NOT_FOUND,
} from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const rateLimitResponse = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `opp_unlock:${auth.userId}`);
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

    const opp = await oppsRepo.findById(opportunityId);
    if (!opp) routeError(404, EC_OPPORTUNITY_NOT_FOUND, "机会不存在");
    const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

    try {
      const result = await executeOpportunityUnlock(
        { dbPool, opportunitiesRepo: oppsRepo, membershipRepo },
        {
          userId: auth.userId,
          opportunityId,
          unlockType,
          price,
          snapshotJson: JSON.stringify(snapshot),
        },
      );
      if (result.alreadyUnlocked) {
        return NextResponse.json({ success: true, alreadyUnlocked: true });
      }
      return NextResponse.json({ success: true, unlock_type: unlockType }, { status: 201 });
    } catch (err) {
      if (err instanceof OpportunityUnlockError) {
        if (err.code === "FREE_LIMIT_REACHED") {
          routeError(402, EC_FREE_LIMIT_REACHED, "免费查看次数已用完");
        }
        routeError(402, EC_PAID_QUOTA_REQUIRED, "付费查看次数已用完，请开通会员");
      }
      throw err;
    }
  },
);
