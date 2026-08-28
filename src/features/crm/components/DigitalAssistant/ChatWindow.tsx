/**
 * 对话主窗口
 * Chat Window Component
 *
 * @module features/crm/components/DigitalAssistant/ChatWindow
 * @description 组合消息列表、输入框、快捷操作、输入状态指示器
 *              Composes message list, input field, quick actions, and typing indicator
 */

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type {
  ChatMessage,
  AssistantMode,
  QuickActionType,
} from "../../hooks/useDigitalAssistant";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { QuickActions } from "./QuickActions";

type ChatWindowProps = {
  messages: ChatMessage[];
  mode: AssistantMode;
  isThinking: boolean;
  onSend: (content: string) => void;
  onQuickAction: (action: QuickActionType) => void;
};

export function ChatWindow({
  messages,
  mode,
  isThinking,
  onSend,
  onQuickAction,
}: ChatWindowProps) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    onSend(input.trim());
    setInput("");
  };

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
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin"
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* AI 正在思考指示器 */}
        {isThinking && <TypingIndicator />}
      </div>

      {/* ── 快捷操作（仅 AI 模式显示） ── */}
      {mode === "ai" && (
        <QuickActions
          t={t}
          onAction={onQuickAction}
          disabled={isThinking}
        />
      )}

      {/* ── 等待人工接入提示 ── */}
      {mode === "waiting" && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-700 font-medium">
              {t("crmAssistantWaitingNotice")}
            </span>
          </div>
        </div>
      )}

      {/* ── 输入框 ── */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-slate-200 bg-white"
      >
        <div className="flex items-end gap-2">
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
          <button
            type="submit"
            disabled={!input.trim() || isThinking || mode === "waiting"}
            className="shrink-0 bg-teal-600 text-white p-2.5 rounded-xl
              hover:bg-teal-500 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t("crmAssistantSend")}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

ChatWindow.displayName = "ChatWindow";
