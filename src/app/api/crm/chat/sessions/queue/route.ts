/**
 * CRM 客服排队状态 API（P1）
 *
 * GET /api/crm/chat/sessions/queue?sessionId=xxx
 * 返回 waiting 会话的排队位置、在线客服数与预计等待时长，供前端排队横幅轮询。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { sessionOwnedBy } from "@/lib/repos/chat.repo";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) routeError(400, 40022, "缺少 sessionId");

  const chatRepo = getContext().chatRepo;
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) routeError(404, 40023, "会话不存在");
  if (!sessionOwnedBy(session, auth)) routeError(403, 40003, "无权访问此会话");

  // 仅 waiting 会话有排队语义；active/closed 返回空态，前端据此停止轮询
  if (session.status !== "waiting") {
    return NextResponse.json({ position: 0, agentsOnline: 0, avgAcceptSeconds: null, status: session.status });
  }

  const info = await chatRepo.getQueueInfo(sessionId);
  return NextResponse.json({ ...info, status: session.status });
});
