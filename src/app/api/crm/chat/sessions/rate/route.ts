/**
 * CRM 会话满意度评价 API（P1）
 *
 * POST /api/crm/chat/sessions/rate
 * Body: { sessionId, satisfaction: 1-5, tag?, comment? }
 *
 * 仅会话所有者、仅 closed 且未评价过的会话可提交（repo 条件更新保证幂等）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { chatRatingSchema } from "@/lib/validators/chat";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";

const rateLimiterConfig = {
  windowMs: 10 * 60 * 1000,
  maxAttempts: 10,
  persistFile: path.join(getRateLimitPersistDir(), "chat-rate.json"),
};

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, rateLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: 40022, message: "无效的请求体", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = chatRatingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 40022, message: "参数校验失败", error: parsed.error.issues[0]?.message ?? "Invalid params" },
      { status: 400 },
    );
  }

  const { sessionId, satisfaction, tag, comment } = parsed.data;
  const chatRepo = getContext().chatRepo;
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }
  if (!sessionOwnedBy(session, auth)) {
    return NextResponse.json(
      { code: 40003, message: "无权评价此会话", error: "无权评价此会话" },
      { status: 403 },
    );
  }

  const ok = await chatRepo.rateSession(sessionId, { satisfaction, tag, comment });
  if (!ok) {
    return NextResponse.json(
      { code: 40901, message: "会话未结束或已评价过", error: "Not rateable" },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true });
}
