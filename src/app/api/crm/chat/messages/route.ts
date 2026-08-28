/**
 * CRM 客服消息 API
 * CRM Chat Messages API
 *
 * GET  /api/crm/chat/messages?sessionId=xxx  — 获取会话消息列表
 * POST /api/crm/chat/messages                — 发送消息（客户/运营经理）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireAdmin } from "@/lib/middleware/auth";

/**
 * GET /api/crm/chat/messages?sessionId=xxx
 * 获取指定会话的消息列表
 */
export async function GET(req: NextRequest) {
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

  // 验证会话存在且用户有权访问
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 非 admin 只能查看自己的会话
  if (session.customer_id !== auth.userKey) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck instanceof Response) return adminCheck;
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 100;
  const messages = await chatRepo.listMessages(sessionId, limit);
  return NextResponse.json(messages);
}

/**
 * POST /api/crm/chat/messages
 * 发送消息
 * Body: { sessionId: number, role: "customer"|"agent", content: string, metadata?: object }
 *
 * 注: role="ai" 的消息由后端 AI 服务写入，前端只能发 customer/agent
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { sessionId, role, content, metadata } = body as {
    sessionId: number;
    role: "customer" | "agent";
    content: string;
    metadata?: Record<string, unknown>;
  };

  if (!sessionId || !content) {
    return NextResponse.json(
      { code: 40022, message: "缺少必填字段", error: "Missing sessionId or content" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;

  // 验证会话存在
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 客户只能发 customer 消息；agent 消息需要 admin 权限
  let effectiveRole: "customer" | "agent" = "customer";
  if (role === "agent") {
    const adminCheck = await requireAdmin(req);
    if (adminCheck instanceof Response) return adminCheck;
    effectiveRole = "agent";
  }

  // 客户发消息时，如果会话还在 waiting 状态且是第一条消息，递增 AI 计数
  if (effectiveRole === "customer") {
    await chatRepo.incrementAiCount(sessionId);
  }

  const messageId = await chatRepo.insertMessage({
    sessionId,
    role: effectiveRole,
    content,
    metadata,
  });

  // 查询刚插入的消息返回
  const [msg] = await chatRepo.listMessages(sessionId, 200);
  const createdMsg = msg?.id === messageId ? msg : { id: messageId, session_id: sessionId, role: effectiveRole, content, metadata: null, created_at: new Date() };

  return NextResponse.json(createdMsg, { status: 201 });
}
