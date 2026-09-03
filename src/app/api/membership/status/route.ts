/**
 * GET /api/membership/status — 会员状态（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { resolveMembershipState } = await import("@/lib/services/membership-status");
  const { extractTierLabel } = await import("@/lib/services/membership-upgrade");
  const membershipRepo = getContext().user.membershipRepo;
  const state = await resolveMembershipState(membershipRepo, auth.userId!);

  return NextResponse.json({
    user_id: auth.userId,
    membership_tier: state.tier,
    free_quota: state.freeQuota,
    free_used: state.freeUsed,
    free_remaining: state.freeRemaining,
    paid_unlocks: state.paidUnlocks,
    paid_quota_total: state.paidQuotaTotal,
    paid_quota_used: state.paidQuotaUsed,
    paid_quota_remaining: state.paidQuotaRemaining,
    current_plan_code: state.currentBest?.plan_code ?? null,
    current_plan_name: state.currentBest?.plan_name ?? null,
    current_plan_tier_label: state.currentBest ? extractTierLabel(state.currentBest.plan_name) : null,
    current_plan_price: state.currentBest ? Number(state.currentBest.price) : null,
    active_subscriptions: state.activeSubscriptions,
    entitlements: state.entitlements,
  });
}
