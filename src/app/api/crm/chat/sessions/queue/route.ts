/**
 * CRM 客服排队状态 API（P1）
 *
 * GET /api/crm/chat/sessions/queue?sessionId=xxx
 * 返回 waiting 会话的排队位置、在线客服数与预计等待时长，供前端排队横幅轮询。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";

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
  const session = await chatRepo.findSessionById(sessionId);
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

  // 仅 waiting 会话有排队语义；active/closed 返回空态，前端据此停止轮询
  if (session.status !== "waiting") {
    return NextResponse.json({ position: 0, agentsOnline: 0, avgAcceptSeconds: null, status: session.status });
  }

  const info = await chatRepo.getQueueInfo(sessionId);
  return NextResponse.json({ ...info, status: session.status });
}
