/**
 * 消息气泡组件
 * Message Bubble Component
 *
 * @module features/crm/components/DigitalAssistant/MessageBubble
 * @description 根据角色（用户 / AI / 系统）渲染不同样式的消息气泡
 *              Renders message bubbles with different styles based on role (user / assistant / system)
 */

import type { ChatMessage } from "../../hooks/useDigitalAssistant";

type MessageBubbleProps = {
  message: ChatMessage;
};

/** 格式化时间戳为 HH:MM */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp } = message;

  // ── 系统消息（居中分隔线样式） ──
  if (role === "system") {
    return (
      <div className="flex items-center justify-center my-3">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span className="text-3xs text-slate-500 font-medium">{content}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        </div>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? "bg-teal-600 text-white rounded-ee-sm"
            : "bg-slate-50 text-slate-700 border border-slate-200 rounded-es-sm"
          }`}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
        <span
          className={`text-2xs mt-1 block ${
            isUser ? "text-teal-200" : "text-slate-400"
          }`}
        >
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

MessageBubble.displayName = "MessageBubble";
