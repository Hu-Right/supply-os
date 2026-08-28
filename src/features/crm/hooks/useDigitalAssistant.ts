/**
 * 数字人客服 Hook
 * Digital Assistant Hook
 *
 * @module features/crm/hooks/useDigitalAssistant
 * @description 管理数字人客服的对话状态、消息收发、模式切换（AI / 等待人工 / 人工）
 *              Manages digital assistant conversation state, message send/receive, mode switching
 */

import { useState, useCallback, useRef } from "react";
import { useLocale } from "@/core/i18n";

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

/** Hook 入参 */
export interface UseDigitalAssistantOptions {
  /** 当前线索数（用于上下文） */
  leadCount?: number;
  /** 当前活跃线索数 */
  activeLeadCount?: number;
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
  const { leadCount = 0, activeLeadCount = 0 } = options;

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
   * 当前阶段：AI 模拟回复（后续接入后端 API）
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sendingRef.current) return;
      sendingRef.current = true;

      // 确保有欢迎消息
      ensureWelcome();

      // 追加用户消息
      appendMessage("user", content);

      // 模拟 AI 思考延迟
      setIsThinking(true);
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
      setIsThinking(false);

      // ── 临时：基于关键词的简单回复（后续替换为后端 API） ──
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
      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        // 根据操作类型给出不同回复
        const replies: Record<QuickActionType, string> = {
          match: t("crmAssistantReplyMatch"),
          query_leads: t("crmAssistantReplyLeads", { count: String(leadCount) }),
          lead_status: t("crmAssistantReplyLeadStatus"),
          opp_help: t("crmAssistantReplyOpportunities"),
          request_human: "",
        };
        appendMessage("assistant", replies[action]);
      }, 600 + Math.random() * 400);
    },
    [appendMessage, ensureWelcome, t, leadCount, activeLeadCount],
  );

  /** 请求转人工 */
  const requestHumanAgent = useCallback(async () => {
    ensureWelcome();
    setMode("waiting");
    appendMessage("system", t("crmAssistantWaitingMsg"));

    // 模拟等待人工接入（后续接入 SSE）
    await new Promise((r) => setTimeout(r, 2000));

    setMode("human");
    setAgentName(t("crmDefaultAgentName"));
    appendMessage("system", t("crmAssistantAgentJoined"));
    appendMessage(
      "assistant",
      t("crmAssistantHumanGreeting"),
    );
  }, [appendMessage, ensureWelcome, t]);

  /** 结束人工会话 */
  const endHumanSession = useCallback(() => {
    setMode("ai");
    setAgentName(null);
    appendMessage("system", t("crmAssistantSessionEnded"));
  }, [appendMessage, t]);

  /** 清空对话 */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setMode("ai");
    setAgentName(null);
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
  };
}
