/**
 * CRM 客服会话 API
 * CRM Chat Sessions API
 *
 * GET  /api/crm/chat/sessions          — 列出活跃会话（admin）或当前用户的会话
 * POST /api/crm/chat/sessions          — 创建新会话（转人工时调用）
 * PUT  /api/crm/chat/sessions          — 接入会话（admin 运营经理操作）
 * DELETE /api/crm/chat/sessions        — 关闭会话
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireAdmin } from "@/lib/middleware/auth";

/**
 * GET /api/crm/chat/sessions
 * admin → 列出所有 waiting/active 会话
 * 普通用户 → 列出自己的活跃会话
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const chatRepo = getContext().chatRepo;

  // admin 看全部
  const isAdmin = req.nextUrl.searchParams.get("admin") === "1";
  if (isAdmin) {
    const adminAuth = await requireAdmin(req);
    if (adminAuth instanceof Response) return adminAuth;
    const sessions = await chatRepo.listActiveSessions();
    return NextResponse.json(sessions);
  }

  // 普通用户看自己的
  const sessions = await chatRepo.listSessionsByCustomer(auth.userKey);
  return NextResponse.json(sessions);
}

/**
 * POST /api/crm/chat/sessions
 * 创建新客服会话（数字人转人工时前端调用）
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { customerName, leadId, locale, aiSummary } = body as {
    customerName?: string;
    leadId?: string;
    locale?: string;
    aiSummary?: string;
  };

  const chatRepo = getContext().chatRepo;
  const sessionId = await chatRepo.createSession({
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
 * PUT /api/crm/chat/sessions
 * 运营经理接入会话（admin only）
 * Body: { sessionId: number }
 */
export async function PUT(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof Response) return adminAuth;

  const body = await req.json();
  const { sessionId } = body as { sessionId: number };

  if (!sessionId) {
    return NextResponse.json(
      { code: 40022, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;
  await chatRepo.acceptSession(sessionId, adminAuth.userKey, adminAuth.userKey);

  const session = await chatRepo.findSessionById(sessionId);
  return NextResponse.json(session);
}

/**
 * DELETE /api/crm/chat/sessions?sessionId=xxx
 * 关闭会话（admin 或会话所有者）
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

  // 非 admin 只能关闭自己的会话
  if (session.customer_id !== auth.userKey) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck instanceof Response) return adminCheck;
  }

  await chatRepo.closeSession(sessionId);
  return NextResponse.json({ success: true });
}
