/**
 * POST /api/opportunities/:id/view — 浏览计数（带限流）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const rateLimitResponse = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 120 }, () => `opp_view:${auth.userId}`);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const opportunityId = Number(id);
    const ctx = getContext();
    const oppsRepo = ctx.opportunitiesRepo;

    // 浏览流水留痕已随 crm_user_notice_views.opportunity_id 列一并退役（2026-09-30）：
    // 商机无独立详情页，该打点自上线起零业务流量，仅保留商机表自身计数
    await oppsRepo.incrementViewCount(opportunityId);
    return NextResponse.json({ success: true });
  },
);
