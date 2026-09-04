/**
 * 数字人客服主组件
 * Digital Assistant Main Component
 *
 * @module features/crm/components/DigitalAssistant/DigitalAssistant
 * @description 浮动触发按钮 + 右侧滑入侧边抽屉，组合 ChatWindow
 *              Floating trigger button + right-side slide-in drawer, composing ChatWindow
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, X, Sparkles, User } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useDigitalAssistant } from "../../hooks/useDigitalAssistant";
import { useChatSSE } from "../../hooks/useChatSSE";
import { useQueueInfo } from "../../hooks/useQueueInfo";
import { attachmentMarkerFromMetadata } from "../../hooks/useDigitalAssistant";
import { ChatWindow } from "./ChatWindow";
import type { Supplier } from "@/types";
import { OPPORTUNITIES } from "@/data";

/** 播放提示音（Web Audio API） */
let _audioCtx: AudioContext | null = null;
function playNotifySound() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
    osc.stop(_audioCtx.currentTime + 0.3);
  } catch { /* 忽略音频错误 */
  }
}

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
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMsgLenRef = useRef(0);

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
  } = useDigitalAssistant({ leadCount, activeLeadCount, suppliers, opportunities: OPPORTUNITIES });

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

  // 根据模式决定 header 样式和文案
  const headerConfig = {
    ai: {
      bgClass: "bg-gradient-to-r from-slate-900 to-slate-950",
      iconBg: "bg-teal-500",
      Icon: Sparkles,
      title: t("crmAssistantTitle"),
      statusText: t("crmAssistantAiOnline"),
      statusDot: "bg-teal-400",
    },
    waiting: {
      bgClass: "bg-gradient-to-r from-amber-900 to-amber-950",
      iconBg: "bg-amber-500",
      Icon: Sparkles,
      title: t("crmAssistantTitle"),
      statusText: t("crmAssistantConnecting"),
      statusDot: "bg-amber-400 animate-pulse",
    },
    human: {
      bgClass: "bg-gradient-to-r from-emerald-900 to-emerald-950",
      iconBg: "bg-emerald-500",
      Icon: User,
      title: agentName || t("crmAssistantTitle"),
      statusText: t("crmAssistantHumanOnline"),
      statusDot: "bg-emerald-400 animate-pulse",
    },
  };

  const config = headerConfig[mode];
  const HeaderIcon = config.Icon;

  return (
    <>
      {/* ── 浮动触发按钮 ── */}
      {!isOpen && (
        <Button
          type="button"
          variant="primary"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 end-6 z-20 px-5 py-3 rounded-full shadow-lg
            hover:bg-teal-500 hover:shadow-xl hover:scale-105
            transition-all duration-200 group
            md:bottom-6 bottom-20"
          aria-label={t("crmAssistantOpen")}
        >
          <MessageCircle className="w-5 h-5 group-hover:animate-pulse" />
          <span className="text-sm font-bold">{t("crmAssistant")}</span>
          {/* 未读消息计数 */}
          {unreadCount > 0 && (
            <span className="absolute -top-2 -end-2 min-w-[20px] h-5 px-1 bg-red-500 text-white text-2xs font-bold rounded-full border-2 border-white flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      )}

      {/* ── 侧边抽屉 ── */}
      {isOpen && (
        <>
          {/* 遮罩层（移动端） */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* 抽屉主体 */}
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-sm
              bg-white border-s border-slate-200 shadow-2xl
              flex flex-col animate-in slide-in-from-end duration-300"
          >
            {/* ── Header ── */}
            <div className={`flex items-center justify-between p-4 ${config.bgClass} text-white`}>
              <div className="flex items-center gap-3">
                {/* 头像 */}
                <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}>
                  <HeaderIcon className="w-5 h-5 text-white" />
                </div>
                {/* 标题 + 状态 */}
                <div>
                  <p className="text-sm font-bold">{config.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${config.statusDot}`} />
                    <span className="text-3xs text-slate-300">{config.statusText}</span>
                  </div>
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex items-center gap-2">
                {/* AI 模式：显示转人工按钮 */}
                {mode === "ai" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={requestHumanAgent}
                    className="text-3xs px-3 py-1 rounded-full text-white
                      border border-slate-600 hover:bg-slate-800"
                  >
                    {t("crmRequestHuman")}
                  </Button>
                )}
                {/* 人工模式：显示结束会话按钮 */}
                {mode === "human" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={endHumanSession}
                    className="text-3xs px-3 py-1 rounded-full text-white
                      border border-slate-600 hover:bg-slate-800"
                  >
                    {t("crmEndHumanSession")}
                  </Button>
                )}
                {/* 关闭按钮 */}
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-slate-800"
                  aria-label={t("uiClose")}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* ── 对话区域 ── */}
            <ChatWindow
              messages={messages}
              mode={mode}
              isThinking={isThinking}
              onSend={sendMessage}
              onQuickAction={triggerQuickAction}
              queueInfo={queueInfo}
              pendingRating={pendingRating}
              onSubmitRating={submitRating}
              onSkipRating={skipRating}
              matchPhase={matchPhase}
              matchReport={matchReport}
              suppliers={suppliers}
              opportunities={OPPORTUNITIES}
              matchSupplier={matchSupplier}
              matchOpportunity={matchOpportunity}
              onSetMatchSupplier={setMatchSupplier}
              onSetMatchOpportunity={setMatchOpportunity}
              onTriggerMatch={triggerMatch}
              onResetMatch={resetMatch}
            />
          </div>
        </>
      )}
    </>
  );
}

DigitalAssistant.displayName = "DigitalAssistant";
