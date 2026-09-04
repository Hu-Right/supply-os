/**
 * 聊天输入框组件
 * Chat Input Component
 *
 * @module features/crm/components/DigitalAssistant/ChatInput
 * @description 包含文本输入、附件上传、发送按钮
 */

import { useState, useRef } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { api, getAuthToken } from "@/core/http";
import { Button, Textarea } from "@/shared/ui";
import type { AttachmentMeta } from "../../hooks/useDigitalAssistant";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** 与后端上传白名单一致（扩展名粗筛，服务端仍做 magic bytes 校验） */
const ACCEPT_EXTS = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar";

export interface ChatInputProps {
  /** 发送消息回调 */
  onSend: (content: string, attachment?: AttachmentMeta) => void;
  /** 是否正在思考（禁用发送） */
  isThinking: boolean;
  /** 当前模式（waiting 态禁用输入） */
  mode: "ai" | "human" | "waiting";
  /** 是否隐藏（历史视图/评分态） */
  hidden?: boolean;
}

export function ChatInput({ onSend, isThinking, mode, hidden }: ChatInputProps) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentMeta | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    <form
      onSubmit={handleSubmit}
      className={`p-4 border-t border-slate-200 bg-white ${hidden ? "hidden" : ""}`}
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
        <Textarea
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
  );
}

ChatInput.displayName = "ChatInput";
