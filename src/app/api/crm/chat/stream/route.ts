/**
 * CRM 客服消息 SSE 流式推送
 * CRM Chat SSE Stream
 *
 * GET /api/crm/chat/stream?sessionId=xxx — 实时推送新消息（运营经理端）
 *
 * @module api/crm/chat/stream
 * @description 基于 SSE (Server-Sent Events) 的实时消息推送。
 *              运营经理打开会话后，通过 EventSource 接收新消息。
 *              每 2 秒轮询数据库，有新消息时推送 event: message。
 *              客户端断开连接时自动清理。
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import type { ChatMessageRow } from "@/lib/repos/chat.repo";

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 2000;
/** 最大空闲时间（毫秒），超时后关闭连接 */
const MAX_IDLE = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  // SSE 的 EventSource 不支持自定义 Header，Token 通过 query 参数传递。
  // 将 query token 注入 Authorization Header，使 requireUserKey 能正常解析。
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && !req.headers.get("authorization")) {
    req.headers.set("authorization", `Bearer ${queryToken}`);
  }

  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return Response.json(
      { code: 40022, message: "缺少 sessionId", error: "Missing sessionId" },
      { status: 400 },
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
  if (session.customer_id !== auth.userKey) {
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
  let timerId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接确认
      const initEvent = `event: connected\ndata: ${JSON.stringify({ sessionId, timestamp: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(initEvent));

      // 获取当前最新消息 ID 作为基线 + 记录初始会话状态
      Promise.all([
        chatRepo.listMessages(sessionId, 1),
        chatRepo.findSessionById(sessionId),
      ]).then(([msgs, sessionSnapshot]) => {
        if (msgs.length > 0) {
          lastMessageId = msgs[msgs.length - 1].id;
        }
        if (sessionSnapshot) {
          lastStatus = sessionSnapshot.status;
          // 如果连接时会话已处于 active 状态（断线重连场景），立即推送 agent-joined
          if (lastStatus === "active" && sessionSnapshot.agent_id) {
            agentJoinedEmitted = true;
            const joinEvent = `event: agent-joined\ndata: ${JSON.stringify({
              sessionId,
              agentId: sessionSnapshot.agent_id,
              agentEmail: sessionSnapshot.agent_email,
            })}\n\n`;
            controller.enqueue(encoder.encode(joinEvent));
          }
        }

        // 启动轮询
        timerId = setInterval(async () => {
          try {
            // 查询新消息（ID > lastMessageId）
            const allMessages = await chatRepo.listMessages(sessionId, 500);
            const newMessages = allMessages.filter(
              (m: ChatMessageRow) => m.id > lastMessageId,
            );

            if (newMessages.length > 0) {
              lastActivity = Date.now();
              for (const msg of newMessages) {
                const event = `event: message\ndata: ${JSON.stringify(msg)}\n\n`;
                controller.enqueue(encoder.encode(event));
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
                const joinEvent = `event: agent-joined\ndata: ${JSON.stringify({
                  sessionId,
                  agentId: currentSession.agent_id,
                  agentEmail: currentSession.agent_email,
                })}\n\n`;
                controller.enqueue(encoder.encode(joinEvent));
              }
              lastStatus = currentSession.status;

              // 会话已关闭（Agent 或客户从任一侧关闭）
              if (currentSession.status === "closed") {
                const closeEvent = `event: session_closed\ndata: ${JSON.stringify({ sessionId })}\n\n`;
                controller.enqueue(encoder.encode(closeEvent));
                controller.close();
                return;
              }
            }

            // 空闲超时检查
            if (Date.now() - lastActivity > MAX_IDLE) {
              const timeoutEvent = `event: timeout\ndata: ${JSON.stringify({ reason: "idle_timeout" })}\n\n`;
              controller.enqueue(encoder.encode(timeoutEvent));
              controller.close();
            }
          } catch (err) {
            // 数据库错误时发送错误事件但不中断
            const errorEvent = `event: error\ndata: ${JSON.stringify({ message: "poll_error" })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          }
        }, POLL_INTERVAL);
      }).catch((err) => {
        // 基线查询失败时关闭流，避免静默悬挂
        console.error("[crm/chat/stream] baseline query failed:", err);
        try {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ message: "baseline_query_failed" })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      });
    },
    cancel() {
      // 客户端断开时清理定时器
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
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
