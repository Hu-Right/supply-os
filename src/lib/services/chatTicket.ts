/**
 * SSE 建连一次性 Ticket
 *
 * @module lib/services/chatTicket
 * @description 审查 P0-B4：SSE 的 EventSource 不支持自定义 Header，此前将
 *              长效 JWT 放在 URL query 中，会泄漏进访问日志/代理日志。
 *              改为客户端先 POST 换取 60 秒一次性短时 ticket，再用 ticket 建连。
 *              ticket 为 HMAC 签名（依赖 JWT_SECRET），并有内存一次性核销表。
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const TICKET_TTL_MS = 60_000;

interface TicketPayload {
  /** 用户 key */
  u: string;
  /** 会话 ID */
  s: number;
  /** 过期时间（毫秒） */
  exp: number;
  /** 随机 nonce（同一用户同一会话可重复取票） */
  n: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/** 签发 ticket（明文部分为 base64url(payload).sig） */
export function signChatTicket(userKey: string, sessionId: number): string {
  const payload: TicketPayload = {
    u: userKey,
    s: sessionId,
    exp: Date.now() + TICKET_TTL_MS,
    n: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

// 一次性核销表（单实例内存级；多实例部署时核销退化为 60s 时间窗限制）
const globalForTickets = globalThis as unknown as {
  _chatTicketUsed: Map<string, number> | undefined;
};
const usedTickets =
  globalForTickets._chatTicketUsed ??
  (globalForTickets._chatTicketUsed = new Map<string, number>());

function markUsed(body: string): boolean {
  const now = Date.now();
  // 周期清理过期项，防止表无限增长
  if (usedTickets.size > 10_000) {
    for (const [k, exp] of usedTickets) {
      if (exp < now) usedTickets.delete(k);
    }
  }
  if (usedTickets.has(body)) return false;
  usedTickets.set(body, now + TICKET_TTL_MS);
  return true;
}

export interface VerifiedTicket {
  userKey: string;
  sessionId: number;
}

/**
 * 校验 ticket：签名有效、未过期、且未被使用过。
 * 通过即核销（一次性）。校验失败返回 null。
 */
export function verifyChatTicket(ticket: string): VerifiedTicket | null {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TicketPayload;
  } catch {
    return null;
  }
  if (!payload.u || typeof payload.s !== "number" || payload.exp < Date.now()) {
    return null;
  }
  if (!markUsed(body)) return null;

  return { userKey: payload.u, sessionId: payload.s };
}
