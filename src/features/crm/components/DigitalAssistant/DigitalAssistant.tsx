/**
 * 数字人客服主组件 — 容器
 * Digital Assistant Main Component
 *
 * @module features/crm/components/DigitalAssistant/DigitalAssistant
 * @description 浮动触发按钮 + 右侧滑入侧边抽屉，组合 ChatWindow
 *              Floating trigger button + right-side slide-in drawer, composing ChatWindow
 *
 *              2026-10 组件化拆分（290→约 165 行）：触发按钮/抽屉 Header 见 ./parts
 *              （JSX 逐字不变、件套 memo），提示音上收 ../../utils/notify-sound；
 *              本文件保留会话/SSE/未读等编排逻辑。
 */

import { useState, useEffect, useCallback } from "react";
import { useDigitalAssistant, attachmentMarkerFromMetadata } from "../../hooks/useDigitalAssistant";
import { useChatSSE } from "../../hooks/useChatSSE";
import { useQueueInfo } from "../../hooks/useQueueInfo";
import { playNotifySound } from "../../utils/notify-sound";
import { ChatWindow } from "./ChatWindow";
import { FloatingTrigger, AssistantHeader } from "./parts";
import type { Supplier } from "@/types";
import { ACTIVE_OPPORTUNITIES } from "../../constants";

type DigitalAssistantProps = {
  /** 当前线索总数（传递给 hook 用于上下文回复） */
  leadCount?: number;
  /** 活跃线索数 */
  activeLeadCount?: number;
  /** 供应商列表（AI 撮合用） */
  suppliers?: Supplier[];
};

export function DigitalAssistant({
  leadCount = 0,
  activeLeadCount = 0,
  suppliers = [],
}: DigitalAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const {
    messages,
    mode,
    isThinking,
    agentName,
    sendMessage,
    triggerQuickAction,
    requestHumanAgent,
    endHumanSession,
    ensureWelcome,
    matchPhase,
    matchReport,
    matchSupplier,
    matchOpportunity,
    setMatchSupplier,
    setMatchOpportunity,
    triggerMatch,
    resetMatch,
    chatSessionId,
    addRemoteMessage,
    handleAgentJoined,
    restoreActiveSession,
    handleSessionTimeout,
    handleConnectionLost,
    pendingRating,
    submitRating,
    skipRating,
  } = useDigitalAssistant({ leadCount, activeLeadCount, suppliers, opportunities: ACTIVE_OPPORTUNITIES });

  const closeDrawer = useCallback(() => setIsOpen(false), []);

  // SSE 回调：收到远端消息时追加到对话流 + 通知提示
  const handleSSEMessage = useCallback(
    (msg: { role: string; content: string; metadata?: unknown }) => {
      // SSE 角色 (agent/ai) 映射到前端 MessageRole (assistant)
      if (msg.role === "agent" || msg.role === "ai") {
        // metadata 中的附件转回内容标记（与历史回放同协议）
        const marker = attachmentMarkerFromMetadata(msg.metadata);
        addRemoteMessage("assistant", marker ? `${msg.content} ${marker}`.trim() : msg.content);
        // 抽屉关闭时播放提示音 + 增加未读计数
        if (!isOpen) {
          playNotifySound();
          setUnreadCount((c) => c + 1);
        }
      }
    },
    [addRemoteMessage, isOpen],
  );

  // 排队信息：waiting 态下轮询（P1）
  const queueInfo = useQueueInfo(chatSessionId, mode === "waiting");

  // SSE 连接：转人工后自动建立
  useChatSSE({
    sessionId: chatSessionId,
    enabled: mode === "human" || mode === "waiting",
    onMessage: handleSSEMessage,
    onSessionClosed: () => {
      endHumanSession();
    },
    onAgentJoined: (data) => {
      handleAgentJoined(data.agentEmail);
    },
    onTimeout: handleSessionTimeout,
    onError: handleConnectionLost,
  });

  // 页面加载时恢复进行中的会话（刷新不丢会话）
  useEffect(() => {
    restoreActiveSession();
  }, [restoreActiveSession]);

  // 打开抽屉时初始化欢迎消息 + 清除未读
  useEffect(() => {
    if (isOpen) {
      ensureWelcome();
      setUnreadCount(0);
    }
  }, [isOpen, ensureWelcome]);

  // ESC 关闭抽屉
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  return (
    <>
      {/* ── 浮动触发按钮 ── */}
      {!isOpen && <FloatingTrigger unreadCount={unreadCount} onOpen={() => setIsOpen(true)} />}

      {/* ── 侧边抽屉 ── */}
      {isOpen && (
        <>
          {/* 遮罩层（移动端） */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
            onClick={closeDrawer}
          />

          {/* 抽屉主体 */}
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-sm
              bg-white border-s border-slate-200 shadow-2xl
              flex flex-col animate-in slide-in-from-end duration-300"
          >
            <AssistantHeader
              mode={mode}
              agentName={agentName}
              onRequestHuman={requestHumanAgent}
              onEndHumanSession={endHumanSession}
              onClose={closeDrawer}
            />

            {/* ── 对话区域 ── */}
            <ChatWindow
              chatState={{ messages, mode, isThinking }}
              chatActions={{ onSend: sendMessage, onQuickAction: triggerQuickAction, queueInfo, pendingRating, onSubmitRating: submitRating, onSkipRating: skipRating }}
              matchProps={{ matchPhase, matchReport, suppliers, opportunities: ACTIVE_OPPORTUNITIES, matchSupplier, matchOpportunity, onSetMatchSupplier: setMatchSupplier, onSetMatchOpportunity: setMatchOpportunity, onTriggerMatch: triggerMatch, onResetMatch: resetMatch }}
            />
          </div>
        </>
      )}
    </>
  );
}

DigitalAssistant.displayName = "DigitalAssistant";
