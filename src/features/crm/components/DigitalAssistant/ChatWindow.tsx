/**
 * 对话主窗口
 * Chat Window Component
 *
 * @module features/crm/components/DigitalAssistant/ChatWindow
 * @description 组合消息列表、输入框、快捷操作、历史面板、等待提示
 *              Composes message list, input, quick actions, history panel, waiting banner
 */

import { useState } from "react";
import { History } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Textarea } from "@/shared/ui";
import type {
  ChatMessage,
  AssistantMode,
  QuickActionType,
  MatchPhase,
  AttachmentMeta,
} from "../../hooks/useDigitalAssistant";
import type { QueueInfo } from "../../hooks/useQueueInfo";
import type { Supplier, Opportunity } from "@/types";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { HistoryPanel } from "./HistoryPanel";
import { QuickActions } from "./QuickActions";
import { RatingCard } from "./RatingCard";

type ChatWindowProps = {
  messages: ChatMessage[];
  mode: AssistantMode;
  isThinking: boolean;
  onSend: (content: string, attachment?: AttachmentMeta) => void;
  onQuickAction: (action: QuickActionType) => void;
  /** 排队信息（waiting 态轮询，P1） */
  queueInfo: QueueInfo;
  /** 待评价的已结束人工会话 ID（非 null 时显示评价卡片，P1） */
  pendingRating: number | null;
  onSubmitRating: (score: number, tag?: string, comment?: string) => Promise<void>;
  onSkipRating: () => void;
  // ── AI 撮合 ──
  matchPhase: MatchPhase;
  matchReport: string;
  suppliers: Supplier[];
  opportunities: Opportunity[];
  matchSupplier: Supplier | null;
  matchOpportunity: Opportunity | null;
  onSetMatchSupplier: (s: Supplier | null) => void;
  onSetMatchOpportunity: (o: Opportunity | null) => void;
  onTriggerMatch: () => void;
  onResetMatch: () => void;
};

export function ChatWindow({
  messages,
  mode,
  isThinking,
  onSend,
  onQuickAction,
  queueInfo,
  pendingRating,
  onSubmitRating,
  onSkipRating,
  matchPhase,
  matchReport,
  suppliers,
  opportunities,
  matchSupplier,
  matchOpportunity,
  onSetMatchSupplier,
  onSetMatchOpportunity,
  onTriggerMatch,
}: ChatWindowProps) {
  const { t } = useLocale();

  // ── 历史会话查看（P1，仅 AI 态入口；自包含状态，不污染会话流） ──
  const [historyView, setHistoryView] = useState(false);

  // ── 离线留言兜底（P1：客服全部离线时，waiting 会话可直接留言） ─
  const [leaveMessageOpen, setLeaveMessageOpen] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveMessageDone, setLeaveMessageDone] = useState(false);

  function handleLeaveMessage() {
    const text = leaveMessage.trim();
    if (!text) return;
    onSend(text);
    setLeaveMessage("");
    setLeaveMessageOpen(false);
    setLeaveMessageDone(true);
  }

  const showHistoryButton = mode === "ai" && pendingRating == null && !isThinking && !historyView;
  const showQuickActions = !historyView && mode === "ai" && pendingRating == null;
  const showRating = !historyView && pendingRating != null;
  const showWaitingBanner = !historyView && mode === "waiting";
  const showInput = !historyView && pendingRating == null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 历史会话面板 ── */}
      {historyView && <HistoryPanel onClose={() => setHistoryView(false)} />}

      {/* ── 正常聊天：消息列表区 ── */}
      {!historyView && (
        <ChatMessageList
          messages={messages}
          isThinking={isThinking}
          matchPhase={matchPhase}
          matchReport={matchReport}
          suppliers={suppliers}
          opportunities={opportunities}
          matchSupplier={matchSupplier}
          matchOpportunity={matchOpportunity}
          onSetMatchSupplier={onSetMatchSupplier}
          onSetMatchOpportunity={onSetMatchOpportunity}
          onTriggerMatch={onTriggerMatch}
          t={t}
        />
      )}

      {/* ── 评分卡片（人工会话结束后，P1） ── */}
      {showRating && (
        <RatingCard onSubmit={onSubmitRating} onSkip={onSkipRating} />
      )}

      {/* ── 快捷操作（仅 AI 模式显示） ─ */}
      {showQuickActions && (
        <QuickActions
          t={t}
          onAction={onQuickAction}
          disabled={isThinking}
        />
      )}

      {/* ── 等待人工接入提示（含实时排队信息 + 离线留言兜底，P1） ── */}
      {showWaitingBanner && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {queueInfo.agentsOnline > 0 ? (
              <span className="text-xs text-amber-700 font-medium">
                {t("crmAssistantQueueStatus", {
                  position: String(queueInfo.position),
                  minutes: String(Math.max(1, Math.ceil((queueInfo.estimatedSeconds ?? 300) / 60))),
                })}
              </span>
            ) : (
              <span className="text-xs text-amber-700 font-medium">
                {t("crmAssistantQueueNoAgent")}
              </span>
            )}
          </div>
          {/* 客服全部离线时的留言兜底 */}
          {queueInfo.agentsOnline === 0 && (
            <div className="mt-2">
              {leaveMessageDone ? (
                <p className="text-3xs text-teal-700 font-medium">{t("crmAssistantLeaveDone")}</p>
              ) : leaveMessageOpen ? (
                <div>
                  <Textarea
                    value={leaveMessage}
                    onChange={(e) => setLeaveMessage(e.target.value)}
                    placeholder={t("crmAssistantLeavePlaceholder")}
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none border border-amber-200 rounded-lg px-3 py-2 text-xs
                      text-slate-700 placeholder:text-slate-400 bg-white
                      focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none mb-2"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={!leaveMessage.trim()}
                      onClick={handleLeaveMessage}
                      className="text-3xs px-3 py-1.5 rounded-full"
                    >
                      {t("crmAssistantLeaveSubmit")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setLeaveMessageOpen(false)}
                      className="text-3xs text-slate-400 hover:text-slate-600"
                    >
                      {t("crmAssistantRateSkip")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLeaveMessageOpen(true)}
                  className="text-3xs text-amber-700 underline underline-offset-2 hover:text-amber-900"
                >
                  {t("crmAssistantLeaveMessage")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 历史会话入口（仅 AI 空闲态，P1） */}
      {showHistoryButton && (
        <div className="px-4 pb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setHistoryView(true)}
            className="flex items-center gap-1 text-3xs text-slate-400 hover:text-teal-600"
          >
            <History className="w-3 h-3" /> {t("crmAssistantHistory")}
          </button>
        </div>
      )}

      {/* ── 输入框 ── */}
      <ChatInput
        onSend={onSend}
        isThinking={isThinking}
        mode={mode}
        hidden={!showInput}
      />
    </div>
  );
}

ChatWindow.displayName = "ChatWindow";
