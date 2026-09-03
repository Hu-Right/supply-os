/**
 * 对话主窗口
 * Chat Window Component
 *
 * @module features/crm/components/DigitalAssistant/ChatWindow
 * @description 组合消息列表、输入框、快捷操作、输入状态指示器
 *              Composes message list, input field, quick actions, and typing indicator
 */

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, History, ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { api, getAuthToken } from "@/core/http";
import { Button } from "@/shared/ui";
import type {
  ChatMessage,
  AssistantMode,
  QuickActionType,
  MatchPhase,
  AttachmentMeta,
} from "../../hooks/useDigitalAssistant";
import { attachmentMarkerFromMetadata } from "../../hooks/useDigitalAssistant";
import type { QueueInfo } from "../../hooks/useQueueInfo";
import type { Supplier, Opportunity } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { QuickActions } from "./QuickActions";
import { MatchSelector } from "./MatchSelector";
import { MatchReportCard } from "./MatchReportCard";
import { RatingCard } from "./RatingCard";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** 与后端上传白名单一致（扩展名粗筛，服务端仍做 magic bytes 校验） */
const ACCEPT_EXTS = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar";

/** 历史会话列表项（GET /sessions/history 返回） */
interface HistoryItem {
  id: number;
  agent_email: string | null;
  created_at: string;
  closed_at: string | null;
  satisfaction: number | null;
  last_message: string | null;
  message_count: number;
}

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
  onResetMatch,
}: ChatWindowProps) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentMeta | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  /** 本地系统提示（上传失败等），不进对话流持久化 */
  function appendLocalSystem(msg: string) {
    setUploadError(msg);
    setTimeout(() => setUploadError(null), 4000);
  }

  // 附件上传（POST /api/crm/chat/upload，FormData 需 raw fetch；api() 只支持 JSON body）
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      appendLocalSystem(t("crmAssistantFileTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAuthToken();
      const res = await fetch(`${BASE_URL}/api/crm/chat/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = (await res.json()) as { url: string; name: string; type: string };
      setPendingAttachment({ url: data.url, name: data.name, type: data.type });
    } catch {
      appendLocalSystem(t("crmAssistantUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isThinking || uploading) return;
    const text = input.trim();
    if (!text && !pendingAttachment) return;
    onSend(text, pendingAttachment ?? undefined);
    setInput("");
    setPendingAttachment(null);
  };

  // ── 历史会话查看（P1，仅 AI 态入口；自包含状态，不污染会话流） ──
  const [historyView, setHistoryView] = useState<"none" | "list" | "transcript">("none");
  const [historySessions, setHistorySessions] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transcript, setTranscript] = useState<ChatMessage[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  async function openHistory() {
    setHistoryView("list");
    setHistoryLoading(true);
    try {
      const data = await api<{ sessions: HistoryItem[] }>("/api/crm/chat/sessions/history?limit=20");
      setHistorySessions(data.sessions ?? []);
    } catch {
      setHistorySessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function viewTranscript(item: HistoryItem) {
    setHistoryView("transcript");
    setTranscriptLoading(true);
    setTranscript(null);
    try {
      const rows = await api<Array<{ id: number; role: string; content: string; metadata: unknown; created_at: string }>>(
        `/api/crm/chat/messages?sessionId=${item.id}&limit=200`,
      );
      setTranscript(
        (rows ?? []).map((m) => ({
          id: `h_${m.id}`,
          role: (m.role === "customer" ? "user" : "assistant") as ChatMessage["role"],
          content: m.content + attachmentMarkerFromMetadata(m.metadata),
          timestamp: new Date(m.created_at).getTime() || Date.now(),
          isHistory: true,
        })),
      );
    } catch {
      setTranscript([]);
    } finally {
      setTranscriptLoading(false);
      requestAnimationFrame(() => {
        if (transcriptScrollRef.current) {
          transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
        }
      });
    }
  }

  function historyDate(item: HistoryItem): string {
    const d = item.closed_at ?? item.created_at;
    return new Date(d).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // ── 离线留言兜底（P1：客服全部离线时，waiting 会话可直接留言） ──
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 输入框占位符根据模式变化
  const placeholder =
    mode === "human"
      ? t("crmAssistantHumanPlaceholder")
      : mode === "waiting"
        ? t("crmAssistantWaitingPlaceholder")
        : t("crmAssistantPlaceholder");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 消息列表区 ── */}
      {/* ── 历史会话列表（P1） ── */}
      {historyView === "list" && (
        <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">{t("crmAssistantHistory")}</p>
            <button
              type="button"
              onClick={() => setHistoryView("none")}
              className="flex items-center gap-1 text-3xs text-slate-400 hover:text-teal-600"
            >
              <ArrowLeft className="w-3 h-3" /> {t("crmAssistantHistoryBack")}
            </button>
          </div>
          {historyLoading && <p className="text-3xs text-slate-400 py-4 text-center">…</p>}
          {!historyLoading && historySessions.length === 0 && (
            <p className="text-3xs text-slate-400 py-6 text-center">{t("crmAssistantHistoryEmpty")}</p>
          )}
          <div className="space-y-2">
            {historySessions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => viewTranscript(item)}
                className="w-full text-start px-3 py-2.5 rounded-lg border border-slate-200
                  hover:border-teal-400 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-3xs text-slate-500">{historyDate(item)}</span>
                  {item.satisfaction != null && (
                    <span className="text-3xs text-amber-500 font-semibold">
                      {"★".repeat(item.satisfaction)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 truncate">
                  {item.last_message ? item.last_message.slice(0, 60) : t("crmAssistantHistoryEmpty")}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 历史会话回放（只读，P1） ── */}
      {historyView === "transcript" && (
        <>
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-3xs text-slate-500">{t("crmAssistantHistoryReadonly")}</span>
            <button
              type="button"
              onClick={() => setHistoryView("list")}
              className="flex items-center gap-1 text-3xs text-slate-400 hover:text-teal-600"
            >
              <ArrowLeft className="w-3 h-3" /> {t("crmAssistantHistoryBack")}
            </button>
          </div>
          <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
            {transcriptLoading && <p className="text-3xs text-slate-400 py-4 text-center">…</p>}
            {transcript?.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
          </div>
        </>
      )}

      {/* ── 正常聊天：消息列表区 ── */}
      {historyView === "none" && (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin"
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* ── AI 撮合选择器（内联在消息流中） ── */}
            {(matchPhase === "selecting" || matchPhase === "matching") && (
              <MatchSelector
                suppliers={suppliers}
                opportunities={opportunities}
                selectedSupplier={matchSupplier}
                selectedOpportunity={matchOpportunity}
                isMatching={matchPhase === "matching"}
                onSelectSupplier={onSetMatchSupplier}
                onSelectOpportunity={onSetMatchOpportunity}
                onTrigger={onTriggerMatch}
                t={t}
              />
            )}

            {/* ── AI 撮合报告卡片 ── */}
            {matchPhase === "done" && matchReport && matchSupplier && matchOpportunity && (
              <MatchReportCard
                report={matchReport}
                supplierName={matchSupplier.nameZh || matchSupplier.nameEn}
                opportunityName={matchOpportunity.titleZh || matchOpportunity.titleEn}
                t={t}
              />
            )}

            {/* AI 正在思考指示器 */}
            {isThinking && matchPhase !== "matching" && <TypingIndicator />}
          </div>

          {/* 历史会话入口（仅 AI 空闲态，P1） */}
          {mode === "ai" && pendingRating == null && !isThinking && (
            <div className="px-4 pb-1 flex justify-end">
              <button
                type="button"
                onClick={openHistory}
                className="flex items-center gap-1 text-3xs text-slate-400 hover:text-teal-600"
              >
                <History className="w-3 h-3" /> {t("crmAssistantHistory")}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── 评分卡片（人工会话结束后，P1） ── */}
      {historyView === "none" && pendingRating != null && (
        <RatingCard onSubmit={onSubmitRating} onSkip={onSkipRating} />
      )}

      {/* ── 快捷操作（仅 AI 模式显示） ── */}
      {historyView === "none" && mode === "ai" && pendingRating == null && (
        <QuickActions
          t={t}
          onAction={onQuickAction}
          disabled={isThinking}
        />
      )}

      {/* ── 等待人工接入提示（含实时排队信息 + 离线留言兜底，P1） ── */}
      {historyView === "none" && mode === "waiting" && (
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
                  <textarea
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

      {/* ── 输入框 ── */}
      <form
        onSubmit={handleSubmit}
        className={`p-4 border-t border-slate-200 bg-white ${historyView !== "none" || pendingRating != null ? "hidden" : ""}`}
      >
        {/* 上传失败提示 */}
        {uploadError && (
          <p className="mb-2 text-2xs text-red-500">{uploadError}</p>
        )}
        {/* 附件预览 */}
        {pendingAttachment && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-600 truncate flex-1">{pendingAttachment.name}</span>
            <button
              type="button"
              onClick={() => setPendingAttachment(null)}
              className="text-slate-400 hover:text-slate-600"
              aria-label={t("uiClose")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* 附件选择（waiting 态禁用） */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_EXTS}
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={mode === "waiting" || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("crmAssistantAttach")}
            title={t("crmAssistantAttach")}
          >
            <Paperclip className={`w-4 h-4 ${uploading ? "animate-pulse" : ""}`} />
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={mode === "waiting"}
            rows={1}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-2.5 text-sm
              text-slate-700 placeholder:text-slate-400
              focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none
              disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
              transition-colors"
            style={{ maxHeight: "120px" }}
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={(!input.trim() && !pendingAttachment) || isThinking || uploading || mode === "waiting"}
            className="shrink-0 rounded-xl p-2.5 hover:bg-teal-500"
            aria-label={t("crmAssistantSend")}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

ChatWindow.displayName = "ChatWindow";
