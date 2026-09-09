/**
 * POST /api/notices/:id/view — 浏览计数（带限流）
 *
 * @module app/api/notices/[id]/view/route
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { recordNoticeView } from "@/lib/services/notice-service";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 120,
    }, () => `view:${auth.userId}`);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const noticeId = Number(id);

    await recordNoticeView({
      userId: auth.userId,
      noticeId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1",
    });
    return NextResponse.json({ success: true });
  },
);
