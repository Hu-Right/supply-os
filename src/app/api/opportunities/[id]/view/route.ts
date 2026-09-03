/**
 * POST /api/opportunities/:id/view — 浏览计数（带限流）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const rateLimitResponse = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 120 }, () => `opp_view:${auth.userId ?? auth.userKey}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const opportunityId = Number(id);
  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;

  await oppsRepo.insertView({
    userId: auth.userId!,
    opportunityId,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1",
  });
  await oppsRepo.incrementViewCount(opportunityId);
  return NextResponse.json({ success: true });
}
