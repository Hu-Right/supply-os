/**
 * SSE 消息流 Hook
 * Chat SSE Stream Hook
 *
 * @module features/crm/hooks/useChatSSE
 * @description 封装 EventSource 连接 SSE 流，接收实时客服消息。
 *              支持自动重连、JWT 鉴权、生命周期管理。
 *              Wraps EventSource for SSE stream, receives real-time chat messages.
 *              Supports auto-reconnect, JWT auth, lifecycle management.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { getAuthToken } from "@/core/http";
import type { ChatMessageRow } from "@/lib/repos/chat.repo";

export type SSEStatus = "disconnected" | "connecting" | "connected" | "error";

export interface UseChatSSEOptions {
  /** 会话 ID（null 时不建立连接） */
  sessionId: number | null;
  /** 收到新消息回调 */
  onMessage?: (msg: ChatMessageRow) => void;
  /** 会话关闭回调 */
  onSessionClosed?: () => void;
  /** 连接状态变化回调 */
  onStatusChange?: (status: SSEStatus) => void;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

export interface UseChatSSEReturn {
  /** 当前连接状态 */
  status: SSEStatus;
  /** 手动断开连接 */
  disconnect: () => void;
  /** 手动重连 */
  reconnect: () => void;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function useChatSSE(options: UseChatSSEOptions): UseChatSSEReturn {
  const { sessionId, onMessage, onSessionClosed, onStatusChange, enabled = true } = options;

  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef({ onMessage, onSessionClosed, onStatusChange });

  // 保持回调引用最新
  callbacksRef.current = { onMessage, onSessionClosed, onStatusChange };

  const updateStatus = useCallback((newStatus: SSEStatus) => {
    setStatus(newStatus);
    callbacksRef.current.onStatusChange?.(newStatus);
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    updateStatus("disconnected");
  }, [updateStatus]);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) return;

    // 清理旧连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    updateStatus("connecting");

    // 构建 URL（SSE 不支持自定义 Header，通过 query param 传 token）
    const token = getAuthToken();
    const url = `${BASE_URL}/api/crm/chat/stream?sessionId=${sessionId}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      updateStatus("connected");
    });

    es.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as ChatMessageRow;
        callbacksRef.current.onMessage?.(msg);
      } catch {
        // 忽略解析错误
      }
    });

    es.addEventListener("session_closed", () => {
      callbacksRef.current.onSessionClosed?.();
      disconnect();
    });

    es.addEventListener("timeout", () => {
      disconnect();
    });

    es.onerror = () => {
      updateStatus("error");
      // EventSource 会自动尝试重连，但 SSE 端点需要 JWT
      // 如果连接失败，关闭并标记错误
      setTimeout(() => {
        if (es.readyState === EventSource.CLOSED) {
          updateStatus("error");
        }
      }, 3000);
    };
  }, [sessionId, enabled, updateStatus, disconnect]);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => connect(), 500);
  }, [disconnect, connect]);

  // 自动连接/断开
  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [sessionId, enabled]);

  return { status, disconnect, reconnect };
}
