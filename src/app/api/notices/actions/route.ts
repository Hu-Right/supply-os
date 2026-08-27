/**
 * 公告用户动作路由（浏览/解锁/意向/反馈）
 * Notice user action routes (view/unlock/interest/feedback)
 *
 * @module app/api/notices/actions/route
 * @description 从 Express routes/notices/actions.routes.ts 迁移。
 *              路由层仅做参数解析、校验与响应构造；业务编排已下沉至
 *              lib/services/notice-actions.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import {
  executeUnlock,
  processFeedback,
  submitInterest,
  NoticeNotFoundError,
  QuotaExceededError,
} from "@/lib/services/notice-actions";
import { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";
import { NoticeInteractionRepo } from "@/lib/repos/notices/notice-interaction.repo";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeFeedbackRepo } from "@/lib/repos/notices/notice-feedback.repo";
import { MembershipRepo } from "@/lib/repos/membership.repo";
import type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";

// ── 错误码定义（与 server/utils/http-error.ts 保持一致）──
const ApiErrorCode = {
  USER_REQUIRED: 40001,
  SESSION_REQUIRED: 40002,
  ACTIONS_REQUIRED: 40003,
  TOO_MANY_ACTIONS: 40004,
  NO_VALID_ACTIONS: 40005,
  NOTICE_NOT_FOUND: 40006,
  FREE_LIMIT_REACHED: 41001,
  PAID_QUOTA_REQUIRED: 41002,
} as const;

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { code, message, error: message, ...extra },
    { status },
  );
}

// ── GET /api/notices/unlocks — 解锁列表 ─
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/notices/unlocks
  if (path.endsWith("/unlocks")) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const pool = getPool();
    const unlockRepo = new NoticeUnlockRepo(pool);
    const rows = await unlockRepo.listNoticeUnlocks(auth.userKey);
    return NextResponse.json(rows);
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

// ── POST 端点 ──
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;
  const pool = getPool();

  // POST /api/notices/feedback — 推荐反馈
  if (path.endsWith("/feedback")) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const userKey = auth.userKey;
    if (!userKey) return sendError("请先登录", 400, ApiErrorCode.USER_REQUIRED);

    const body = await req.json();
    const sessionId = String(body.session_id || "").trim().slice(0, 64);
    if (!sessionId) return sendError("缺少会话标识", 400, ApiErrorCode.SESSION_REQUIRED);

    const VALID_ACTIONS = new Set([
      "impression", "click", "unlock", "dismiss", "favorite",
      "dwell", "scroll_end", "quick_exit", "revisit",
    ]);
    const rawActions: any[] = Array.isArray(body.actions)
      ? body.actions : body.notice_id ? [body] : [];
    if (rawActions.length === 0) return sendError("请提供操作列表", 400, ApiErrorCode.ACTIONS_REQUIRED);
    if (rawActions.length > 50) return sendError("单次最多 50 条操作", 400, ApiErrorCode.TOO_MANY_ACTIONS, { max: 50 });

    const items: RecoFeedbackItem[] = rawActions
      .map((item) => ({
        noticeId: Number(item?.notice_id || 0),
        action: String(item?.action || "").trim(),
        recoScore: Number.isFinite(Number(item?.reco_score)) ? Number(item.reco_score) : null,
        position: Number.isInteger(Number(item?.position)) && Number(item.position) >= 0 ? Number(item.position) : null,
        variant: String(item?.variant || "").trim().slice(0, 20) || null,
        dwellMs: Number.isInteger(Number(item?.dwell_ms)) && Number(item.dwell_ms) > 0 ? Number(item.dwell_ms) : null,
      }))
      .filter((item) => item.noticeId > 0 && VALID_ACTIONS.has(item.action));
    if (items.length === 0) return sendError("无有效操作", 400, ApiErrorCode.NO_VALID_ACTIONS);

    const result = await processFeedback(
      {
        detailRepo: new NoticeDetailRepo(pool),
        feedbackRepo: new NoticeFeedbackRepo(pool),
        dbPool: pool,
      },
      { userKey, sessionId, items },
    );
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  }

  // POST /api/notices/:id/view — 浏览计数（带限流）
  if (/\/api\/notices\/\d+\/view$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    // 限流检查
    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 120,
    }, (r) => `view:${auth.userKey}`);
    if (rateLimitResponse) return rateLimitResponse;

    const idMatch = path.match(/\/api\/notices\/(\d+)\/view$/);
    const noticeId = idMatch ? Number(idMatch[1]) : 0;
    const userKey = auth.userKey;

    const interactionRepo = new NoticeInteractionRepo(pool);
    await interactionRepo.insertView({
      userKey,
      noticeId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1",
    });
    return NextResponse.json({ success: true });
  }

  // POST /api/notices/:id/unlock — 解锁（带限流）
  if (/\/api\/notices\/\d+\/unlock$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    // 限流检查
    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 30,
    }, (r) => `unlock:${auth.userKey}`);
    if (rateLimitResponse) return rateLimitResponse;

    const idMatch = path.match(/\/api\/notices\/(\d+)\/unlock$/);
    const noticeId = idMatch ? Number(idMatch[1]) : 0;
    const userKey = auth.userKey;
    const body = await req.json();
    const unlockType = body.unlock_type === "subscription" || body.unlock_type === "single"
      ? body.unlock_type : "free";

    // P2-10 安全修复：解锁价格服务端定价——从 crm_membership_plans 取在售 single 套餐价
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
        { userKey, noticeId, unlockType, price },
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

  // POST /api/notices/:id/interest — 意向
  if (/\/api\/notices\/\d+\/interest$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const idMatch = path.match(/\/api\/notices\/(\d+)\/interest$/);
    const noticeId = idMatch ? Number(idMatch[1]) : 0;
    const userKey = auth.userKey;
    const body = await req.json();
    const interestType = body.interest_type === "subscribed" ? "subscribed" : "interested";
    const note = String(body.note || "").slice(0, 500);

    if (!userKey) return sendError("请先登录", 400, ApiErrorCode.USER_REQUIRED);

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

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
