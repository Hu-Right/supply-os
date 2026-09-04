/**
 * POST /api/notices/feedback — 推荐反馈
 *
 * @module app/api/notices/feedback/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { processFeedback } from "@/lib/services/notice-actions";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeFeedbackRepo } from "@/lib/repos/notices/notice-feedback.repo";
import type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";
import {
  EC_USER_REQUIRED, EC_SESSION_REQUIRED, EC_FORBIDDEN,
  EC_TOO_MANY_ACTIONS, EC_NO_VALID_ACTIONS,
} from "@/shared/constants/api";

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  if (!auth.userId) return sendError("请先登录", 400, EC_USER_REQUIRED);

  const body = await req.json();
  const sessionId = String(body.session_id || "").trim().slice(0, 64);
  if (!sessionId) return sendError("缺少会话标识", 400, EC_SESSION_REQUIRED);

  const VALID_ACTIONS = new Set([
    "impression", "click", "unlock", "dismiss", "favorite",
    "dwell", "scroll_end", "quick_exit", "revisit",
  ]);
  const rawActions: any[] = Array.isArray(body.actions)
    ? body.actions : body.notice_id ? [body] : [];
  if (rawActions.length === 0) return sendError("请提供操作列表", 400, EC_FORBIDDEN);
  if (rawActions.length > 50) return sendError("单次最多 50 条操作", 400, EC_TOO_MANY_ACTIONS, { max: 50 });

  const pool = getPool();
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
  if (items.length === 0) return sendError("无有效操作", 400, EC_NO_VALID_ACTIONS);

  const result = await processFeedback(
    {
      detailRepo: new NoticeDetailRepo(pool),
      feedbackRepo: new NoticeFeedbackRepo(pool),
      dbPool: pool,
    },
    { userId: auth.userId!, sessionId, items },
  );
  return NextResponse.json({ success: true, ...result }, { status: 201 });
}
