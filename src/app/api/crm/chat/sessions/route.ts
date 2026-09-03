/**
 * CRM 客服会话 API
 *
 * GET    /api/crm/chat/sessions   — 列出当前用户的活跃会话
 * POST   /api/crm/chat/sessions   — 创建/复用会话（转人工时调用）
 * DELETE /api/crm/chat/sessions   — 关闭会话（仅会话所有者）
 *
 * 审查 P0-B3：原 PUT（接入会话）无角色校验、无状态机校验，属越权旁路
 * 入口（真正的客服接入链路在 intelligence-daily，走条件更新防并发），
 * 已下线。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { chatSessionCreateSchema } from "@/lib/validators/chat";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";
import path from "path";

/** 转人工创建会话：同一用户 10 分钟内最多 5 次（正常场景一次即复用） */
const createLimiterConfig = {
  windowMs: 10 * 60 * 1000,
  maxAttempts: 5,
  persistFile: path.join(getRateLimitPersistDir(), "chat-session-create.json"),
};

/** 会话读取/关闭：防滥用兜底 */
const readLimiterConfig = {
  windowMs: 60 * 1000,
  maxAttempts: 60,
  persistFile: path.join(getRateLimitPersistDir(), "chat-session-read.json"),
};

/**
 * GET /api/crm/chat/sessions
 * 列出当前用户的活跃会话（waiting/active）
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, readLimiterConfig, () => `user:${auth.userId ?? auth.userKey}`);
  if (limited) return limited;

  const chatRepo = getContext().chatRepo;
  // user_id 为准（迁移 062）；旧 token 无 userId 时无历史会话可列
  if (auth.userId == null) return NextResponse.json([]);
  const sessions = await chatRepo.listSessionsByCustomer(auth.userId);
  return NextResponse.json(sessions);
}

/**
 * POST /api/crm/chat/sessions
 * 创建新客服会话（数字人转人工时前端调用）。
 * 审查 P0-B10：已有 waiting/active 会话时直接复用，不重复创建，
 * 防止连点转人工刷出多条会话污染客服列表。
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, createLimiterConfig, () => `user:${auth.userId ?? auth.userKey}`);
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

  const parsed = chatSessionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 40022, message: "参数校验失败", error: parsed.error.issues[0]?.message ?? "Invalid params" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;

  // 复用既有 waiting/active 会话（取最近一条）
  if (auth.userId == null) {
    return NextResponse.json(
      { code: 40042, message: "登录态缺少用户 ID，请重新登录", error: "Missing userId" },
      { status: 401 },
    );
  }
  const existing = await chatRepo.listSessionsByCustomer(auth.userId);
  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }

  const { customerName, leadId, locale, aiSummary } = parsed.data;
  const sessionId = await chatRepo.createSession({
    userId: auth.userId,
    customerId: auth.userKey,
    customerName,
    leadId,
    locale,
    aiSummary,
  });

  const session = await chatRepo.findSessionById(sessionId);
  return NextResponse.json(session, { status: 201 });
}

/**
 * DELETE /api/crm/chat/sessions?sessionId=xxx
 * 关闭会话（仅会话所有者）
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return NextResponse.json(
      { code: 40022, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;
  const session = await chatRepo.findSessionById(sessionId);

  if (!session) {
    return NextResponse.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 只能关闭自己的会话（user_id 为准，历史行回退 customer_id）
  if (!sessionOwnedBy(session, auth)) {
    return NextResponse.json(
      { code: 40003, message: "无权关闭此会话", error: "无权关闭此会话" },
      { status: 403 },
    );
  }

  await chatRepo.closeSession(sessionId);
  return NextResponse.json({ success: true });
}
