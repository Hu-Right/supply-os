/**
 * CRM 客服消息 SSE 流式推送
 *
 * GET /api/crm/chat/stream?ticket=xxx — 实时推送新消息（客户端）
 *
 * @module api/crm/chat/stream
 * @description 基于 SSE (Server-Sent Events) 的实时消息推送。
 *              每 2 秒增量轮询数据库（WHERE id > lastId，审查 P0-B8：修复
 *              原"取前 500 条再内存过滤"超会话漏推问题），有新消息时推送
 *              event: message。每 25 秒发送 `: ping` 心跳注释帧，供客户端
 *              看门狗与中间代理保活。
 *              审查 P0-B4：鉴权改为 60 秒一次性 ticket（POST
 *              /stream/ticket 换取），JWT 不再出现在 URL 中。
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";
import { verifyChatTicket } from "@/lib/services/chatTicket";

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 2000;
/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL = 25_000;
/** 最大空闲时间（毫秒），超时后关闭连接 */
const MAX_IDLE = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  // 一次性 ticket 鉴权（替代原 URL query JWT）
  const ticket = req.nextUrl.searchParams.get("ticket");
  const verified = ticket ? verifyChatTicket(ticket) : null;
  if (!verified) {
    return Response.json(
      { code: 40042, message: "SSE 凭据无效或已过期", error: "Invalid or expired ticket" },
      { status: 401 },
    );
  }
  const { userKey, sessionId: ticketSessionId } = verified;

  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return Response.json(
      { code: 40022, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
    );
  }
  // ticket 与 sessionId 必须匹配，防止用 A 会话的 ticket 监听 B 会话
  if (sessionId !== ticketSessionId) {
    return Response.json(
      { code: 40003, message: "凭据与会话不匹配", error: "Ticket/session mismatch" },
      { status: 403 },
    );
  }

  const chatRepo = getContext().chatRepo;

  // 验证会话存在
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) {
    return Response.json(
      { code: 40023, message: "会话不存在", error: "Session not found" },
      { status: 404 },
    );
  }

  // 权限检查：仅会话所有者可访问
  if (session.customer_id !== userKey) {
    return Response.json(
      { code: 40003, message: "无权访问此会话", error: "无权访问此会话" },
      { status: 403 },
    );
  }

  // 记录上次推送的最后消息 ID
  let lastMessageId = 0;
  let lastActivity = Date.now();
  // 追踪会话状态变化（用于推送 agent-joined 等系统事件）
  let lastStatus = "";
  let agentJoinedEmitted = false;

  const encoder = new TextEncoder();
  let pollTimerId: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimerId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        if (pollTimerId) clearInterval(pollTimerId);
        if (heartbeatTimerId) clearInterval(heartbeatTimerId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 发送初始连接确认
      safeEnqueue(
        `event: connected\ndata: ${JSON.stringify({ sessionId, timestamp: Date.now() })}\n\n`,
      );

      // 服务端心跳注释帧：客户端看门狗与中间代理保活（审查 P0-B7）
      heartbeatTimerId = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_INTERVAL);

      // 获取当前最新消息 ID 作为基线 + 记录初始会话状态
      Promise.all([
        chatRepo.listMessages(sessionId, 1),
        chatRepo.findSessionById(sessionId),
      ])
        .then(([msgs, sessionSnapshot]) => {
          // 基线查询期间流可能已被取消
          if (closed) return;
          if (msgs.length > 0) {
            lastMessageId = Math.max(...msgs.map((m) => m.id));
          }
          if (sessionSnapshot) {
            lastStatus = sessionSnapshot.status;
            // 如果连接时会话已处于 active 状态（断线重连场景），立即推送 agent-joined
            if (lastStatus === "active" && sessionSnapshot.agent_id) {
              agentJoinedEmitted = true;
              safeEnqueue(
                `event: agent-joined\ndata: ${JSON.stringify({
                  sessionId,
                  agentId: sessionSnapshot.agent_id,
                  agentEmail: sessionSnapshot.agent_email,
                })}\n\n`,
              );
            }
          }

          // 启动轮询
          pollTimerId = setInterval(async () => {
            try {
              // 增量查询新消息（WHERE id > lastMessageId，无截断窗口）
              const newMessages = await chatRepo.listMessagesAfter(sessionId, lastMessageId);

              if (newMessages.length > 0) {
                lastActivity = Date.now();
                for (const msg of newMessages) {
                  safeEnqueue(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
                  lastMessageId = msg.id;
                }
              }

              // 检测会话状态变化（Agent 接入 / 关闭）
              const currentSession = await chatRepo.findSessionById(sessionId);
              if (currentSession) {
                // Agent 接入：waiting → active
                if (
                  !agentJoinedEmitted &&
                  lastStatus === "waiting" &&
                  currentSession.status === "active"
                ) {
                  agentJoinedEmitted = true;
                  lastActivity = Date.now();
                  safeEnqueue(
                    `event: agent-joined\ndata: ${JSON.stringify({
                      sessionId,
                      agentId: currentSession.agent_id,
                      agentEmail: currentSession.agent_email,
                    })}\n\n`,
                  );
                }
                lastStatus = currentSession.status;

                // 会话已关闭（Agent 或客户从任一侧关闭）
                if (currentSession.status === "closed") {
                  safeEnqueue(
                    `event: session_closed\ndata: ${JSON.stringify({ sessionId })}\n\n`,
                  );
                  safeClose();
                  return;
                }
              }

              // 空闲超时检查
              if (Date.now() - lastActivity > MAX_IDLE) {
                safeEnqueue(
                  `event: timeout\ndata: ${JSON.stringify({ reason: "idle_timeout" })}\n\n`,
                );
                safeClose();
              }
            } catch {
              // 数据库错误时发送错误事件但不中断
              safeEnqueue(
                `event: error\ndata: ${JSON.stringify({ message: "poll_error" })}\n\n`,
              );
            }
          }, POLL_INTERVAL);
        })
        .catch((err) => {
          // 基线查询失败时关闭流，避免静默悬挂
          console.error("[crm/chat/stream] baseline query failed:", err);
          safeEnqueue(
            `event: error\ndata: ${JSON.stringify({ message: "baseline_query_failed" })}\n\n`,
          );
          safeClose();
        });
    },
    cancel() {
      // 客户端断开时清理定时器
      if (pollTimerId) clearInterval(pollTimerId);
      if (heartbeatTimerId) clearInterval(heartbeatTimerId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 防止代理缓冲
      "X-Accel-Buffering": "no",
    },
  });
}
