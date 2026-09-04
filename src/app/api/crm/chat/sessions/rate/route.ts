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
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { chatRatingSchema } from "@/lib/validators/chat";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";

const rateLimiterConfig = {
  windowMs: 10 * 60 * 1000,
  maxAttempts: 10,
  persistFile: path.join(getRateLimitPersistDir(), "chat-rate.json"),
};

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const limited = checkRateLimit(req, rateLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    routeError(400, 40022, "无效的请求体");
  }

  const parsed = chatRatingSchema.safeParse(body);
  if (!parsed.success) {
    routeError(400, 40022, parsed.error.issues[0]?.message ?? "参数校验失败");
  }

  const { sessionId, satisfaction, tag, comment } = parsed.data!;
  const chatRepo = getContext().chatRepo;
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) routeError(404, 40023, "会话不存在");
  if (!sessionOwnedBy(session, auth)) routeError(403, 40003, "无权评价此会话");

  const ok = await chatRepo.rateSession(sessionId, { satisfaction, tag, comment });
  if (!ok) routeError(409, 40901, "会话未结束或已评价过");

  return NextResponse.json({ success: true });
});
