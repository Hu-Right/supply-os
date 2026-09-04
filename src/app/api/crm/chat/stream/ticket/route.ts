/**
 * SSE 建连 Ticket 发放
 *
 * POST /api/crm/chat/stream/ticket
 * Body: { sessionId: number }
 *
 * 审查 P0-B4：EventSource 不支持自定义 Header，此前 JWT 走 URL query 会
 * 泄漏进访问日志。客户端先持 Bearer JWT 换取 60 秒一次性 ticket，
 * 再用 ticket 建连 SSE，日志中不再出现长效凭据。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { signChatTicket } from "@/lib/services/chatTicket";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";
import { z } from "zod";
import { CHAT_TICKET_TTL_MS, ONE_MINUTE_MS } from "@/shared/constants/time";
import { EC_INVALID_REQUEST, EC_FORBIDDEN, EC_NOT_FOUND } from "@/shared/constants/api";

const TICKET_TTL_SECONDS = CHAT_TICKET_TTL_MS / 1000;

const ticketSchema = z.object({ sessionId: z.number().int().positive() });

const ticketLimiterConfig = {
  windowMs: ONE_MINUTE_MS,
  maxAttempts: 30,
  persistFile: path.join(getRateLimitPersistDir(), "chat-stream-ticket.json"),
};

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const limited = checkRateLimit(req, ticketLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    routeError(400, EC_INVALID_REQUEST, "无效的请求体");
  }

  const parsed = ticketSchema.safeParse(body);
  if (!parsed.success) {
    routeError(400, EC_INVALID_REQUEST, "缺少有效的 sessionId");
  }

  const { sessionId } = parsed.data!;
  const session = await getContext().chatRepo.findSessionById(sessionId);
  if (!session) routeError(404, EC_NOT_FOUND, "会话不存在");
  if (!sessionOwnedBy(session, auth)) routeError(403, EC_FORBIDDEN, "无权访问此会话");

  return NextResponse.json({
    ticket: signChatTicket(auth.userId, sessionId),
    expiresIn: TICKET_TTL_SECONDS,
  });
});
