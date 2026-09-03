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
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { signChatTicket } from "@/lib/services/chatTicket";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";
import { z } from "zod";

const TICKET_TTL_SECONDS = 60;

const ticketSchema = z.object({ sessionId: z.number().int().positive() });

const ticketLimiterConfig = {
  windowMs: 60 * 1000,
  maxAttempts: 30,
  persistFile: path.join(getRateLimitPersistDir(), "chat-stream-ticket.json"),
};

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, ticketLimiterConfig, () => `user:${auth.userId}`);
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

  const parsed = ticketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 40022, message: "缺少有效的 sessionId", error: "Invalid sessionId" },
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;
  const session = await getContext().chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }
  if (!sessionOwnedBy(session, auth)) {
    return NextResponse.json(
      { code: 40003, message: "无权访问此会话", error: "无权访问此会话" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ticket: signChatTicket(auth.userId, sessionId),
    expiresIn: TICKET_TTL_SECONDS,
  });
}
