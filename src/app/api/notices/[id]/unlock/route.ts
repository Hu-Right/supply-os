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
  EC_NOTICE_NOT_FOUND, EC_FREE_LIMIT_REACHED, EC_PAID_QUOTA_REQUIRED, EC_OUT_OF_CATEGORY,
} from "@/shared/constants/api";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { getContext } from "@/lib/db/context";

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
    // 行业墙：被行业限定档位的用户只能解锁其绑定品目大类内的公告（8,800元/行业口径）
    {
      const ctx = getContext();
      if (!(await canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId))) {
        routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { outOfCategory: true });
      }
    }
    // 空请求体/非法 JSON 返回 400 而非 500（body 可缺省，缺省按 free 解锁处理）
    let body: { unlock_type?: string };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const unlockType = body?.unlock_type === "subscription" ? "subscription" : "free";

    try {
      const result = await unlockNotice({ userId: auth.userId, noticeId, unlockType });
      if (result.alreadyUnlocked) {
        return NextResponse.json({ success: true, alreadyUnlocked: true });
      }
      return NextResponse.json({ success: true, unlockType: result.unlockType }, { status: 201 });
    } catch (err) {
      if (err instanceof NoticeNotFoundError) {
        routeError(404, EC_NOTICE_NOT_FOUND, "公告不存在");
      }
      if (err instanceof QuotaExceededError) {
        const code = err.code === "FREE_LIMIT_REACHED" ? EC_FREE_LIMIT_REACHED : EC_PAID_QUOTA_REQUIRED;
        // 免费试用已移除、付费档矩阵为不限量（-1）⇒ 402 只可能意味着「非会员」，按会员专属口径提示
        const message = "该内容为会员专属，升级会员后可查看完整信息。";
        routeError(402, code, message);
      }
      throw err;
    }
  },
);
