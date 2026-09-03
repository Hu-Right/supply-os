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

/** 格式化时间戳为 HH:MM:SS */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** 解析消息中的附件（从 content 中的 [attachment:...] 标记解析） */
function parseAttachment(content: string): { url: string; name: string; isImage: boolean } | null {
  const match = content.match(/\[attachment:([^\]]+)\]/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return {
      url: data.url,
      name: data.name || "文件",
      isImage: (data.type || "").startsWith("image/"),
    };
  } catch {
    return null;
  }
}

/** 移除 content 中的附件标记 */
function stripAttachmentTag(content: string): string {
  return content.replace(/\[attachment:[^\]]*\]/g, "").trim();
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp } = message;
  const attachment = parseAttachment(content);
  const textContent = stripAttachmentTag(content);

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
        {/* 图片附件 */}
        {attachment?.isImage && (
          <div className="mb-2">
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-w-full max-h-60 rounded-lg cursor-pointer object-cover"
              onClick={() => window.open(attachment.url, "_blank")}
            />
          </div>
        )}
        {/* 文件附件 */}
        {attachment && !attachment.isImage && (
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-xs
              ${isUser ? "bg-teal-700/50" : "bg-slate-100"}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.585a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="truncate">{attachment.name}</span>
          </a>
        )}
        {/* 文本内容 */}
        {textContent && <p className="whitespace-pre-wrap break-words">{textContent}</p>}
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
