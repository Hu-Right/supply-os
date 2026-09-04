/**
 * CRM 客服消息 API
 *
 * GET  /api/crm/chat/messages?sessionId=xxx  — 获取会话消息列表
 * POST /api/crm/chat/messages                — 发送消息（仅 customer 角色）
 *
 * 审查 P0-B1：客户端传入的 role 一律忽略，服务端强制 role="customer"；
 * agent/ai 角色消息只能由客服侧（intelligence-daily 服务端）写入。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { chatMessageSendSchema, sanitizeMetadata } from "@/lib/validators/chat";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";
import { ONE_MINUTE_MS } from "@/shared/constants/time";
import { EC_INVALID_REQUEST, EC_NOT_FOUND, EC_FORBIDDEN } from "@/shared/constants/api";
import { CHAT_MESSAGES_DEFAULT_LIMIT, CHAT_MESSAGES_MAX_LIMIT, clampLimit } from "@/shared/constants/api";

/** 消息发送限流：同一用户每分钟最多 30 条 */
const sendLimiterConfig = {
  windowMs: ONE_MINUTE_MS,
  maxAttempts: 30,
  persistFile: path.join(getRateLimitPersistDir(), "chat-message-send.json"),
};

/** 消息读取限流 */
const readLimiterConfig = {
  windowMs: ONE_MINUTE_MS,
  maxAttempts: 60,
  persistFile: path.join(getRateLimitPersistDir(), "chat-message-read.json"),
};

/**
 * GET /api/crm/chat/messages?sessionId=xxx
 * 获取指定会话的消息列表（仅会话所有者）
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, readLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return NextResponse.json(
      { code: EC_INVALID_REQUEST, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;

  // 验证会话存在且用户有权访问
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: EC_NOT_FOUND, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 只能查看自己的会话（user_id 为准，历史行回退 customer_id）
  if (!sessionOwnedBy(session, auth)) {
    return NextResponse.json(
      { code: EC_FORBIDDEN, message: "无权访问此会话", error: "无权访问此会话" },
      { status: 403 },
    );
  }

  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), CHAT_MESSAGES_DEFAULT_LIMIT, CHAT_MESSAGES_MAX_LIMIT);
  const messages = await chatRepo.listMessages(sessionId, limit);
  return NextResponse.json(messages);
}

/**
 * POST /api/crm/chat/messages
 * 发送消息（客户侧）
 * Body: { sessionId: number, content: string, metadata?: object }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, sendLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: EC_INVALID_REQUEST, message: "无效的请求体", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = chatMessageSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: EC_INVALID_REQUEST, message: "参数校验失败", error: parsed.error.issues[0]?.message ?? "Invalid params" },
      { status: 400 },
    );
  }

  const { sessionId, content } = parsed.data;
  const metadata = sanitizeMetadata(parsed.data.metadata);

  const chatRepo = getContext().chatRepo;

  // 验证会话存在
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: EC_NOT_FOUND, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 只能操作自己的会话（user_id 为准，历史行回退 customer_id）
  if (!sessionOwnedBy(session, auth)) {
    return NextResponse.json(
      { code: EC_FORBIDDEN, message: "无权操作此会话", error: "无权操作此会话" },
      { status: 403 },
    );
  }

  // 已关闭会话拒绝写入，防止"用户以为在跟人工对话实际无人响应"
  if (session.status === "closed") {
    return NextResponse.json(
      { code: 40901, message: "会话已结束", error: "Session already closed" },
      { status: 409 },
    );
  }

  // ai_handled_count 仅统计人工接入前（waiting，AI 模式）的客户消息
  if (session.status === "waiting") {
    await chatRepo.incrementAiCount(sessionId);
  }

  const effectiveRole = "customer" as const;
  const messageId = await chatRepo.insertMessage({
    sessionId,
    role: effectiveRole,
    content,
    metadata,
  });

  // 按 insertId 精确回查（审查 P0-B8：此前取列表第一条，多消息时回显错误）
  const createdMsg = await chatRepo.findMessageById(messageId);
  return NextResponse.json(
    createdMsg ?? {
      id: messageId,
      session_id: sessionId,
      role: effectiveRole,
      content,
      metadata: metadata ?? null,
      created_at: new Date(),
    },
    { status: 201 },
  );
}
