/**
 * SSE 消息流 Hook
 * Chat SSE Stream Hook
 *
 * @module features/crm/hooks/useChatSSE
 * @description 封装 EventSource 连接 SSE 流，接收实时客服消息。
 *              审查 P0：先 POST 换取 60s 一次性 ticket 再建连（JWT 不再进
 *              URL）；服务端每 25s 发心跳帧，客户端看门狗 65s 无事件强制
 *              重连；断线按指数退避自动重连（携带新 ticket），重连超限后
 *              通过 onError 上报，由调用方决定降级。
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { api } from "@/core/http";
import type { ChatMessageRow } from "@/lib/repos/chat.repo";

export type SSEStatus = "disconnected" | "connecting" | "connected" | "error";

export interface UseChatSSEOptions {
  /** 会话 ID（null 时不建立连接） */
  sessionId: number | null;
  /** 收到新消息回调 */
  onMessage?: (msg: ChatMessageRow) => void;
  /** 会话关闭回调 */
  onSessionClosed?: () => void;
  /** Agent 接入回调（内网运营经理接入会话时触发） */
  onAgentJoined?: (data: { sessionId: number; agentId: string | null; agentEmail: string | null }) => void;
  /** 连接状态变化回调 */
  onStatusChange?: (status: SSEStatus) => void;
  /** 服务端空闲超时断流回调（审查 P0-B7：此前静默断开无提示） */
  onTimeout?: () => void;
  /** 重连超限/连接异常回调 */
  onError?: () => void;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 最大自动重连次数 */
  maxReconnectAttempts?: number;
}

export interface UseChatSSEReturn {
  /** 当前连接状态 */
  status: SSEStatus;
  /** 手动断开连接 */
  disconnect: () => void;
  /** 手动重连 */
  reconnect: () => void;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
/** 服务端心跳 25s，看门狗在 65s 无任何事件（含心跳）时判定断流 */
const WATCHDOG_TIMEOUT_MS = 65_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

export function useChatSSE(options: UseChatSSEOptions): UseChatSSEReturn {
  const {
    sessionId,
    onMessage,
    onSessionClosed,
    onAgentJoined,
    onStatusChange,
    onTimeout,
    onError,
    enabled = true,
    maxReconnectAttempts = 5,
  } = options;

  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef({
    onMessage,
    onSessionClosed,
    onAgentJoined,
    onStatusChange,
    onTimeout,
    onError,
  });

  // 保持回调引用最新
  callbacksRef.current = {
    onMessage,
    onSessionClosed,
    onAgentJoined,
    onStatusChange,
    onTimeout,
    onError,
  };

  const updateStatus = useCallback((newStatus: SSEStatus) => {
    setStatus(newStatus);
    callbacksRef.current.onStatusChange?.(newStatus);
  }, []);

  // 连接生命周期状态（ref，避免闭包过期）
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventAtRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const enabledRef = useRef(enabled);
  sessionIdRef.current = sessionId;
  enabledRef.current = enabled;

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimers();
    closeEventSource();
    updateStatus("disconnected");
  }, [clearTimers, closeEventSource, updateStatus]);

  /** 看门狗：心跳/消息停止到达时判定断流，强制走重连 */
  const startWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    lastEventAtRef.current = Date.now();
    watchdogTimerRef.current = setInterval(() => {
      if (Date.now() - lastEventAtRef.current > WATCHDOG_TIMEOUT_MS) {
        // 视为断流：关闭并触发重连
        closeEventSource();
        scheduleReconnect();
      }
    }, 15_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeEventSource]);

  const connect = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid || !enabledRef.current) return;

    clearTimers();
    closeEventSource();
    intentionalCloseRef.current = false;
    updateStatus("connecting");

    // 先换取一次性 ticket（携带 Authorization header），再用 ticket 建连
    api<{ ticket: string }>("/api/crm/chat/stream/ticket", {
      method: "POST",
      body: { sessionId: sid },
    })
      .then(({ ticket }) => {
        if (intentionalCloseRef.current || sessionIdRef.current !== sid) return;

        const url = `${BASE_URL}/api/crm/chat/stream?sessionId=${sid}&ticket=${encodeURIComponent(ticket)}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.addEventListener("connected", () => {
          reconnectAttemptRef.current = 0;
          updateStatus("connected");
          startWatchdog();
        });

        es.addEventListener("message", (event: MessageEvent) => {
          lastEventAtRef.current = Date.now();
          try {
            const msg = JSON.parse(event.data) as ChatMessageRow;
            callbacksRef.current.onMessage?.(msg);
          } catch {
            // 忽略解析错误
          }
        });

        es.addEventListener("agent-joined", (event: MessageEvent) => {
          lastEventAtRef.current = Date.now();
          try {
            const data = JSON.parse(event.data);
            callbacksRef.current.onAgentJoined?.(data);
          } catch {
            // 忽略解析错误
          }
        });

        es.addEventListener("session_closed", () => {
          // 服务端主动关闭的终态，不再重连
          intentionalCloseRef.current = true;
          clearTimers();
          callbacksRef.current.onSessionClosed?.();
          disconnect();
        });

        es.addEventListener("timeout", () => {
          intentionalCloseRef.current = true;
          clearTimers();
          callbacksRef.current.onTimeout?.();
          disconnect();
        });

        es.addEventListener("error", () => {
          // 服务端下发的 error 事件（轮询异常等），流仍存活，仅记录
          lastEventAtRef.current = Date.now();
        });

        es.onerror = () => {
          updateStatus("error");
          scheduleReconnect();
        };
      })
      .catch(() => {
        // ticket 获取失败（401/网络）：退避重试，超限上报
        updateStatus("error");
        scheduleReconnect();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers, closeEventSource, disconnect, updateStatus]);

  /** 指数退避重连：1s 起步、15s 封顶，超限后上报并放弃 */
  function scheduleReconnect() {
    if (intentionalCloseRef.current) return;
    const sid = sessionIdRef.current;
    if (!sid || !enabledRef.current) return;
    if (reconnectTimerRef.current) return; // 已有排程中的重连

    if (reconnectAttemptRef.current >= maxReconnectAttempts) {
      callbacksRef.current.onError?.();
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptRef.current,
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    intentionalCloseRef.current = false;
    connect();
  }, [connect]);

  // 自动连接/断开
  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    }
    return () => {
      intentionalCloseRef.current = true;
      clearTimers();
      closeEventSource();
    };
  }, [sessionId, enabled, connect, clearTimers, closeEventSource]);

  return { status, disconnect, reconnect };
}
