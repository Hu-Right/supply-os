/**
 * POST /api/notices/:id/unlock — 解锁公告（带限流）
 *
 * @module app/api/notices/[id]/unlock/route
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { unlockNotice, NoticeNotFoundError, QuotaExceededError } from "@/lib/services/notice-service";
import {
  EC_NOTICE_NOT_FOUND, EC_FREE_LIMIT_REACHED, EC_PAID_QUOTA_REQUIRED,
} from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 30,
    }, () => `unlock:${auth.userId}`);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const noticeId = Number(id);
    // 空请求体/非法 JSON 返回 400 而非 500（body 可缺省，缺省按 free 解锁处理）
    let body: { unlock_type?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const unlockType = body?.unlock_type === "subscription" || body?.unlock_type === "single"
      ? body.unlock_type : "free";

    try {
      const result = await unlockNotice({ userId: auth.userId, noticeId, unlockType });
      if (result.alreadyUnlocked) {
        return NextResponse.json({ success: true, alreadyUnlocked: true });
      }
      return NextResponse.json({ success: true, unlock_type: result.unlockType }, { status: 201 });
    } catch (err) {
      if (err instanceof NoticeNotFoundError) {
        routeError(404, EC_NOTICE_NOT_FOUND, "公告不存在");
      }
      if (err instanceof QuotaExceededError) {
        const code = err.code === "FREE_LIMIT_REACHED" ? EC_FREE_LIMIT_REACHED : EC_PAID_QUOTA_REQUIRED;
        const message = err.code === "FREE_LIMIT_REACHED" ? "免费查看次数已用完" : "付费查看次数已用完";
        routeError(402, code, message);
      }
      throw err;
    }
  },
);
