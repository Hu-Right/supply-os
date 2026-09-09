/**
 * 客服会话生命周期管理 Hook
 * Chat Session Lifecycle Hook
 *
 * @module features/crm/hooks/useChatSession
 * @description 从 useDigitalAssistant 提取的后端会话管理逻辑：
 *              创建/恢复/关闭会话、SSE 超时/断连处理、满意度评价。
 *              主 hook 组合此 hook + 消息管理 + AI 撮合。
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { attachmentMarkerFromMetadata } from "./chat-types";
import type { MessageRole, ChatMessage, AssistantMode } from "./chat-types";
import type { ChatSessionRow, ChatMessageRow } from "../types";

export interface UseChatSessionReturn {
  chatSessionId: number | null;
  chatSessionIdRef: React.RefObject<number | null>;
  pendingRating: number | null;
  requestHumanAgent: (
    ensureWelcome: () => void,
    setMode: (m: AssistantMode) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    messages: ChatMessage[],
  ) => Promise<void>;
  endHumanSession: (
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    mode: AssistantMode,
  ) => Promise<void>;
  restoreActiveSession: (
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    setMessages: (msgs: ChatMessage[]) => void,
    appendMessage: (role: MessageRole, content: string) => void,
  ) => Promise<void>;
  handleSessionTimeout: (
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    mode: AssistantMode,
  ) => void;
  handleConnectionLost: (
    appendMessage: (role: MessageRole, content: string) => void,
  ) => void;
  handleAgentJoined: (
    agentEmail: string | null,
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
  ) => void;
  submitRating: (
    score: number,
    tag?: string,
    comment?: string,
  ) => Promise<void>;
  skipRating: () => void;
  setChatSessionId: (id: number | null) => void;
}

export function useChatSession(): UseChatSessionReturn {
  const { t, locale } = useLocale();
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const chatSessionIdRef = useRef<number | null>(null);
  useEffect(() => { chatSessionIdRef.current = chatSessionId; }, [chatSessionId]);

  const requestHumanAgent = useCallback(async (
    ensureWelcome: () => void,
    setMode: (m: AssistantMode) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    messages: ChatMessage[],
  ) => {
    ensureWelcome();
    setMode("waiting");
    appendMessage("system", t("crmAssistantWaitingMsg"));
    try {
      const session = await api<{ id: number; customer_name: string | null }>("/api/crm/chat/sessions", {
        method: "POST",
        retryOnAuth: true,
        body: {
          customerName: "CRM User",
          locale,
          aiSummary: messages.slice(-10).map(m => `${m.role}: ${m.content}`).join("\n"),
        },
      });
      setChatSessionId(session.id);
    } catch {
      appendMessage("system", t("crmAssistantApiFallback"));
      return;
    }
  }, [t, locale]);

  const endHumanSession = useCallback(async (
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    mode: AssistantMode,
  ) => {
    const closingSessionId = chatSessionIdRef.current;
    const hadAgent = mode === "human";
    if (closingSessionId) {
      try {
        await api(`/api/crm/chat/sessions?sessionId=${closingSessionId}`, {
          method: "DELETE",
          retryOnAuth: true,
        });
      } catch { /* 关闭失败仍切换状态 */ }
    }
    setMode("ai");
    setAgentName(null);
    setChatSessionId(null);
    appendMessage("system", t("crmAssistantSessionEnded"));
    if (closingSessionId && hadAgent) setPendingRating(closingSessionId);
  }, [t]);

  const restoreActiveSession = useCallback(async (
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    setMessages: (msgs: ChatMessage[]) => void,
    appendMessage: (role: MessageRole, content: string) => void,
  ) => {
    if (chatSessionIdRef.current) return;
    try {
      const sessions = await api<ChatSessionRow[]>("/api/crm/chat/sessions");
      const latest = sessions?.[0];
      if (!latest) return;
      setChatSessionId(latest.id);
      if (latest.status === "active") {
        setMode("human");
        setAgentName(latest.agent_email);
      } else {
        setMode("waiting");
      }
      const history = await api<ChatMessageRow[]>(
        `/api/crm/chat/messages?sessionId=${latest.id}`,
      );
      if (history?.length > 0) {
        setMessages(
          history.map((m) => ({
            id: `hist_${m.id}`,
            role: (m.role === "customer" ? "user" : "assistant") as MessageRole,
            content: m.content + attachmentMarkerFromMetadata(m.metadata),
            timestamp: new Date(m.created_at).getTime() || Date.now(),
            isHistory: true,
          })),
        );
      }
      appendMessage("system", t("crmAssistantSessionRestored"));
    } catch { /* 恢复失败降级为 AI 会话 */ }
  }, [t]);

  const handleSessionTimeout = useCallback((
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
    mode: AssistantMode,
  ) => {
    const closingSessionId = chatSessionIdRef.current;
    const hadAgent = mode === "human";
    if (closingSessionId) appendMessage("system", t("crmAssistantSessionTimeout"));
    setMode("ai");
    setAgentName(null);
    setChatSessionId(null);
    if (closingSessionId && hadAgent) setPendingRating(closingSessionId);
  }, [t]);

  const handleConnectionLost = useCallback((
    appendMessage: (role: MessageRole, content: string) => void,
  ) => {
    if (chatSessionIdRef.current) appendMessage("system", t("crmAssistantConnectionLost"));
  }, [t]);

  const handleAgentJoined = useCallback((
    agentEmail: string | null,
    setMode: (m: AssistantMode) => void,
    setAgentName: (n: string | null) => void,
    appendMessage: (role: MessageRole, content: string) => void,
  ) => {
    setMode("human");
    setAgentName(agentEmail || t("crmDefaultAgentName"));
    appendMessage("system", t("crmAssistantAgentJoined"));
    appendMessage("assistant", t("crmAssistantHumanGreeting"));
  }, [t]);

  const submitRating = useCallback(async (
    score: number,
    tag?: string,
    comment?: string,
  ) => {
    const sessionId = pendingRating;
    if (sessionId == null) return;
    try {
      await api("/api/crm/chat/sessions/rate", {
        method: "POST",
        retryOnAuth: true,
        body: { sessionId, satisfaction: score, tag, comment },
      });
      setPendingRating(null);
    } catch { /* rating failure handled by caller */ }
  }, [pendingRating]);

  const skipRating = useCallback(() => { setPendingRating(null); }, []);

  return {
    chatSessionId,
    chatSessionIdRef,
    pendingRating,
    requestHumanAgent,
    endHumanSession,
    restoreActiveSession,
    handleSessionTimeout,
    handleConnectionLost,
    handleAgentJoined,
    submitRating,
    skipRating,
    setChatSessionId,
  };
}
