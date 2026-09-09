/**
 * 数字人客服 Hook
 * Digital Assistant Hook
 *
 * @module features/crm/hooks/useDigitalAssistant
 * @description 管理数字人客服的对话状态、消息收发、模式切换（AI / 等待人工 / 人工）。
 *              后端会话生命周期已提取至 useChatSession（D4-1 拆分二期）。
 */

import { useState, useCallback, useRef } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { useAiMatch } from "./useAiMatch";
import { useChatSession } from "./useChatSession";
import type { Supplier, Opportunity } from "@/types";
// D4-1 拆分：类型与工具函数提取至 chat-types.ts，此处 re-export 保持向后兼容
import { genMsgId } from "./chat-types";
import { quickActionUserMessage, quickActionAiReply, aiKeywordReply } from "./chat-replies";
export type {
  MessageRole, ChatMessage, AttachmentMeta, AssistantMode,
  QuickActionType, MatchPhase, UseDigitalAssistantOptions, UseDigitalAssistantReturn,
} from "./chat-types";
export { attachmentMarkerFromMetadata } from "./chat-types";
import type {
  MessageRole, ChatMessage, AttachmentMeta, AssistantMode,
  QuickActionType, MatchPhase, UseDigitalAssistantOptions, UseDigitalAssistantReturn,
} from "./chat-types";

// ── Hook 实现 ──

export function useDigitalAssistant(
  options: UseDigitalAssistantOptions = {},
): UseDigitalAssistantReturn {
  const { t } = useLocale();
  const { leadCount = 0, activeLeadCount = 0, suppliers = [], opportunities = [] } = options;

  // ── 子 hook：后端会话管理 ──
  const session = useChatSession();

  // ── AI 撮合集成 ──
  const aiMatch = useAiMatch();
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<AssistantMode>("ai");
  const [isThinking, setIsThinking] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);

  // 防止并发发送
  const sendingRef = useRef(false);

  /** 追加一条消息 */
  const appendMessage = useCallback(
    (role: MessageRole, content: string, isHistory = false) => {
      const msg: ChatMessage = {
        id: genMsgId(),
        role,
        content,
        timestamp: Date.now(),
        isHistory,
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [],
  );

  /** 初始化欢迎消息 */
  const ensureWelcome = useCallback(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: genMsgId(),
          role: "assistant" as const,
          content: t("crmAssistantWelcome"),
          timestamp: Date.now(),
        },
      ];
    });
  }, [t]);

  /** 发送用户消息 */
  const sendMessage = useCallback(
    async (content: string, attachment?: AttachmentMeta) => {
      if (sendingRef.current) return;
      const text = content.trim();
      if (!text && !attachment) return;
      sendingRef.current = true;
      ensureWelcome();

      const displayContent = attachment
        ? `${text} [attachment:${JSON.stringify(attachment)}]`.trim()
        : text;
      appendMessage("user", displayContent);

      // ── 人工模式：发送到后端 API ──
      if (session.chatSessionIdRef.current) {
        try {
          await api("/api/crm/chat/messages", {
            method: "POST",
            retryOnAuth: true,
            body: {
              sessionId: session.chatSessionIdRef.current,
              content: text || attachment?.name || "[附件]",
              metadata: attachment ? { attachment } : undefined,
            },
          });
        } catch {
          appendMessage("assistant", t("crmAssistantApiFallback"));
        } finally {
          sendingRef.current = false;
        }
        return;
      }

      // ── AI 模式：前端模拟回复 ──
      setIsThinking(true);
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
      setIsThinking(false);

      const reply = aiKeywordReply(text, t, leadCount);
      appendMessage("assistant", reply);
      sendingRef.current = false;
    },
    [appendMessage, ensureWelcome, t, leadCount, session.chatSessionIdRef],
  );

  /** 触发快捷操作 */
  const triggerQuickAction = useCallback(
    (action: QuickActionType) => {
      ensureWelcome();
      const msg = quickActionUserMessage(action, t, leadCount, activeLeadCount);
      if (action === "request_human") { requestHumanAgent(); return; }
      appendMessage("user", msg);
      if (action === "match") {
        setMatchPhase("selecting");
        aiMatch.setSelectedSupplier(suppliers.length > 0 ? suppliers[0] : null);
        if (opportunities.length > 0) aiMatch.setSelectedOpportunity(opportunities[0]);
        return;
      }
      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        const reply = quickActionAiReply(action as Exclude<QuickActionType, "match">, t, leadCount);
        appendMessage("assistant", reply);
      }, 600 + Math.random() * 400);
    },
    [appendMessage, ensureWelcome, t, leadCount, activeLeadCount],
  );

  /** 请求转人工 */
  const requestHumanAgent = useCallback(async () => {
    await session.requestHumanAgent(ensureWelcome, setMode, appendMessage, messages);
  }, [session, ensureWelcome, appendMessage, messages]);

  /** 结束人工会话 */
  const endHumanSession = useCallback(async () => {
    await session.endHumanSession(setMode, setAgentName, appendMessage, mode);
  }, [session, appendMessage, mode]);

  /** 触发 AI 撮合 */
  const triggerMatch = useCallback(async () => {
    if (!aiMatch.selectedSupplier || !aiMatch.selectedOpportunity) return;
    setMatchPhase("matching");
    const supplierName = aiMatch.selectedSupplier.nameZh || aiMatch.selectedSupplier.nameEn;
    const oppName = aiMatch.selectedOpportunity.titleZh || aiMatch.selectedOpportunity.titleEn;
    appendMessage("system", t("aiAnalyzing"));
    await aiMatch.triggerMatch(aiMatch.selectedSupplier, aiMatch.selectedOpportunity);
    setMatchPhase("done");
    appendMessage("system", `${supplierName} × ${oppName}`);
  }, [aiMatch, appendMessage, t]);

  const resetMatch = useCallback(() => { setMatchPhase("idle"); }, []);

  return {
    messages,
    mode,
    isThinking,
    agentName,
    sendMessage,
    triggerQuickAction,
    requestHumanAgent,
    endHumanSession,
    clearMessages: () => { setMessages([]); setMode("ai"); setAgentName(null); setMatchPhase("idle"); session.setChatSessionId(null); },
    ensureWelcome,
    matchPhase,
    matchReport: aiMatch.report,
    matchSupplier: aiMatch.selectedSupplier,
    matchOpportunity: aiMatch.selectedOpportunity,
    setMatchSupplier: aiMatch.setSelectedSupplier,
    setMatchOpportunity: aiMatch.setSelectedOpportunity,
    triggerMatch,
    resetMatch,
    chatSessionId: session.chatSessionId,
    addRemoteMessage: appendMessage,
    handleAgentJoined: (email: string | null) => session.handleAgentJoined(email, setMode, setAgentName, appendMessage),
    restoreActiveSession: () => session.restoreActiveSession(setMode, setAgentName, setMessages, appendMessage),
    handleSessionTimeout: () => session.handleSessionTimeout(setMode, setAgentName, appendMessage, mode),
    handleConnectionLost: () => session.handleConnectionLost(appendMessage),
    pendingRating: session.pendingRating,
    submitRating: async (score: number, tag?: string, comment?: string) => {
      await session.submitRating(score, tag, comment);
      appendMessage("system", t("crmAssistantRateThanks"));
    },
    skipRating: () => { session.skipRating(); },
  };
}
