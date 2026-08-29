/**
 * CRM 客服会话 API
 * CRM Chat Sessions API
 *
 * GET  /api/crm/chat/sessions   — 列出当前用户的活跃会话
 * POST /api/crm/chat/sessions   — 创建新会话（转人工时调用）
 * PUT  /api/crm/chat/sessions   — 接入会话
 * DELETE /api/crm/chat/sessions — 关闭会话
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

/**
 * GET /api/crm/chat/sessions
 * 列出当前用户的活跃会话
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const chatRepo = getContext().chatRepo;
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
 * 接入会话
 * Body: { sessionId: number }
 */
export async function PUT(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { sessionId } = body as { sessionId: number };

  if (!sessionId) {
    return NextResponse.json(
      { code: 40022, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
    );
  }

  const chatRepo = getContext().chatRepo;
  await chatRepo.acceptSession(sessionId, auth.userKey, auth.userKey);

  const session = await chatRepo.findSessionById(sessionId);
  return NextResponse.json(session);
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

  // 只能关闭自己的会话
  if (session.customer_id !== auth.userKey) {
    return NextResponse.json(
      { code: 40003, message: "无权关闭此会话", error: "无权关闭此会话" },
      { status: 403 },
    );
  }

  await chatRepo.closeSession(sessionId);
  return NextResponse.json({ success: true });
}
