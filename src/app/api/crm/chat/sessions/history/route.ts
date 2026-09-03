/**
 * CRM 客户侧历史会话 API（P1）
 *
 * GET /api/crm/chat/sessions/history?limit=20&offset=0
 * 当前用户的 closed 会话列表（最后消息预览 + 消息数 + 评分），供"我的咨询记录"。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import path from "path";

const historyLimiterConfig = {
  windowMs: 60 * 1000,
  maxAttempts: 30,
  persistFile: path.join(getRateLimitPersistDir(), "chat-history.json"),
};

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, historyLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  if (!auth.userId) {
    return NextResponse.json({ sessions: [], total: null });
  }

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);

  const sessions = await getContext().chatRepo.listHistorySessions(auth.userId, limit, offset);
  return NextResponse.json({ sessions, limit, offset });
}
