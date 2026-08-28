/**
 * 数字人客服 Hook
 * Digital Assistant Hook
 *
 * @module features/crm/hooks/useDigitalAssistant
 * @description 管理数字人客服的对话状态、消息收发、模式切换（AI / 等待人工 / 人工）
 *              Manages digital assistant conversation state, message send/receive, mode switching
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { useAiMatch } from "./useAiMatch";
import type { Supplier, Opportunity } from "@/types";

// ── 类型定义 ──

/** 消息角色 */
export type MessageRole = "user" | "assistant" | "system";

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** 是否为历史消息（AI → 人工转接时保留） */
  isHistory?: boolean;
}

/** 客服会话模式 */
export type AssistantMode = "ai" | "waiting" | "human";

/** 快捷操作类型 */
export type QuickActionType = "match" | "query_leads" | "lead_status" | "opp_help" | "request_human";

/** 撮合阶段 */
export type MatchPhase = "idle" | "selecting" | "matching" | "done";

/** Hook 入参 */
export interface UseDigitalAssistantOptions {
  /** 当前线索数（用于上下文） */
  leadCount?: number;
  /** 当前活跃线索数 */
  activeLeadCount?: number;
  /** 供应商列表（AI 撮合用） */
  suppliers?: Supplier[];
  /** 商机列表（AI 撮合用） */
  opportunities?: Opportunity[];
}

/** Hook 返回值 */
export interface UseDigitalAssistantReturn {
  messages: ChatMessage[];
  mode: AssistantMode;
  isThinking: boolean;
  agentName: string | null;
  /** 发送用户消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 触发快捷操作 */
  triggerQuickAction: (action: QuickActionType) => void;
  /** 请求转人工 */
  requestHumanAgent: () => Promise<void>;
  /** 结束人工会话 */
  endHumanSession: () => void;
  /** 清空对话 */
  clearMessages: () => void;
  /** 初始化欢迎消息（打开抽屉时调用） */
  ensureWelcome: () => void;
  // ── AI 撮合相关 ──
  /** 撮合阶段 */
  matchPhase: MatchPhase;
  /** AI 撮合报告 */
  matchReport: string;
  /** 撮合选中的供应商 */
  matchSupplier: Supplier | null;
  /** 撮合选中的商机 */
  matchOpportunity: Opportunity | null;
  /** 设置撮合供应商 */
  setMatchSupplier: (s: Supplier | null) => void;
  /** 设置撮合商机 */
  setMatchOpportunity: (o: Opportunity | null) => void;
  /** 触发 AI 撮合 */
  triggerMatch: () => Promise<void>;
  /** 重置撮合阶段 */
  resetMatch: () => void;
  // ── 后端会话相关 ──
  /** 当前后端会话 ID（转人工后创建） */
  chatSessionId: number | null;
  /** 添加远端消息（SSE 接收的 agent/ai 消息） */
  addRemoteMessage: (role: MessageRole, content: string) => void;
}

// ── 工具函数 ──

let _msgCounter = 0;
function genMsgId(): string {
  return `msg_${Date.now()}_${++_msgCounter}`;
}

// ── Hook 实现 ──

export function useDigitalAssistant(
  options: UseDigitalAssistantOptions = {},
): UseDigitalAssistantReturn {
  const { t, locale } = useLocale();
  const { leadCount = 0, activeLeadCount = 0, suppliers = [], opportunities = [] } = options;

  // ── AI 撮合集成 ──
  const aiMatch = useAiMatch();
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<AssistantMode>("ai");
  const [isThinking, setIsThinking] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  // 同步 ref
  useEffect(() => { chatSessionIdRef.current = chatSessionId; }, [chatSessionId]);

  // 防止并发发送
  const sendingRef = useRef(false);
  // 实时读取 chatSessionId（避免 useCallback 闭包过期）
  const chatSessionIdRef = useRef<number | null>(null);

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

  /** 初始化欢迎消息（首次打开时调用） */
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

  /**
   * 发送用户消息
   * 人工模式（有 chatSessionId）：调用后端 API 发送，agent 回复通过 SSE 接收
   * AI 模式（无 chatSessionId）：前端模拟回复
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sendingRef.current) return;
      sendingRef.current = true;

      // 确保有欢迎消息
      ensureWelcome();

      // 追加用户消息到对话流
      appendMessage("user", content);

      // ── 人工模式：发送到后端 API ──
      if (chatSessionIdRef.current) {
        try {
          await api("/api/crm/chat/messages", {
            method: "POST",
            body: {
              sessionId: chatSessionIdRef.current,
              role: "customer",
              content,
            },
          });
          // agent 回复会通过 SSE 推送，由 addRemoteMessage 追加
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

      const lowerContent = content.toLowerCase();
      let reply: string;

      if (lowerContent.includes("线索") || lowerContent.includes("lead")) {
        reply = t("crmAssistantReplyLeads", { count: String(leadCount) });
      } else if (lowerContent.includes("商机") || lowerContent.includes("opportunity")) {
        reply = t("crmAssistantReplyOpportunities");
      } else if (lowerContent.includes("撮合") || lowerContent.includes("match")) {
        reply = t("crmAssistantReplyMatch");
      } else if (lowerContent.includes("人工") || lowerContent.includes("转接")) {
        reply = t("crmAssistantReplyHuman");
      } else {
        reply = t("crmAssistantReplyDefault");
      }

      appendMessage("assistant", reply);
      sendingRef.current = false;
    },
    [appendMessage, ensureWelcome, t, leadCount],
  );

  /** 触发快捷操作 */
  const triggerQuickAction = useCallback(
    (action: QuickActionType) => {
      ensureWelcome();

      const actionMessages: Record<QuickActionType, string> = {
        match: t("crmQuickActionMatch"),
        query_leads: t("crmQuickActionQueryLeads", { count: String(leadCount), active: String(activeLeadCount) }),
        lead_status: t("crmQuickActionLeadStatus", { active: String(activeLeadCount) }),
        opp_help: t("crmQuickActionOppHelp"),
        request_human: "",
      };

      const msg = actionMessages[action];
      if (action === "request_human") {
        requestHumanAgent();
        return;
      }

      // 用户快捷消息 + AI 回复
      appendMessage("user", msg);

      // 撮合操作：进入选择阶段，不生成文本回复
      if (action === "match") {
        setMatchPhase("selecting");
        aiMatch.setSelectedSupplier(suppliers.length > 0 ? suppliers[0] : null);
        if (opportunities.length > 0) aiMatch.setSelectedOpportunity(opportunities[0]);
        return;
      }

      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        const replies: Record<Exclude<QuickActionType, "match">, string> = {
          query_leads: t("crmAssistantReplyLeads", { count: String(leadCount) }),
          lead_status: t("crmAssistantReplyLeadStatus"),
          opp_help: t("crmAssistantReplyOpportunities"),
          request_human: "",
        };
        appendMessage("assistant", replies[action as Exclude<QuickActionType, "match">]);
      }, 600 + Math.random() * 400);
    },
    [appendMessage, ensureWelcome, t, leadCount, activeLeadCount],
  );

  /** 请求转人工（创建后端会话） */
  const requestHumanAgent = useCallback(async () => {
    ensureWelcome();
    setMode("waiting");
    appendMessage("system", t("crmAssistantWaitingMsg"));

    try {
      // 创建后端客服会话
      const session = await api<{ id: number; customer_name: string | null }>("/api/crm/chat/sessions", {
        method: "POST",
        body: {
          customerName: "CRM User",
          locale,
          aiSummary: messages.slice(-10).map(m => `${m.role}: ${m.content}`).join("\n"),
        },
      });
      setChatSessionId(session.id);
    } catch {
      // API 失败时仍允许前端模拟模式
      appendMessage("system", t("crmAssistantApiFallback"));
    }

    // 模拟等待人工接入（后续由 SSE 推送实际接入事件）
    await new Promise((r) => setTimeout(r, 2000));

    setMode("human");
    setAgentName(t("crmDefaultAgentName"));
    appendMessage("system", t("crmAssistantAgentJoined"));
    appendMessage("assistant", t("crmAssistantHumanGreeting"));
  }, [appendMessage, ensureWelcome, t, locale, messages]);

  /** 结束人工会话 */
  const endHumanSession = useCallback(() => {
    setMode("ai");
    setAgentName(null);
    appendMessage("system", t("crmAssistantSessionEnded"));
  }, [appendMessage, t]);

  /** 触发 AI 撮合（从 MatchSelector 组件调用） */
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

  /** 重置撮合阶段 */
  const resetMatch = useCallback(() => {
    setMatchPhase("idle");
  }, []);

  /** 添加远端消息（SSE 接收的 agent/ai 消息） */
  const addRemoteMessage = useCallback(
    (role: MessageRole, content: string) => {
      appendMessage(role, content);
    },
    [appendMessage],
  );

  /** 清空对话 */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setMode("ai");
    setAgentName(null);
    setMatchPhase("idle");
    setChatSessionId(null);
  }, []);

  return {
    messages,
    mode,
    isThinking,
    agentName,
    sendMessage,
    triggerQuickAction,
    requestHumanAgent,
    endHumanSession,
    clearMessages,
    ensureWelcome,
    // AI 撮合
    matchPhase,
    matchReport: aiMatch.report,
    matchSupplier: aiMatch.selectedSupplier,
    matchOpportunity: aiMatch.selectedOpportunity,
    setMatchSupplier: aiMatch.setSelectedSupplier,
    setMatchOpportunity: aiMatch.setSelectedOpportunity,
    triggerMatch,
    resetMatch,
    // 后端会话
    chatSessionId,
    addRemoteMessage,
  };
}
