/**
 * 历史会话面板组件
 * History Panel Component
 *
 * @module features/crm/components/DigitalAssistant/HistoryPanel
 * @description 历史会话列表 + 会话回放（只读）
 */

import { useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import type { ChatMessage } from "../../hooks/useDigitalAssistant";
import { attachmentMarkerFromMetadata } from "../../hooks/useDigitalAssistant";
import { MessageBubble } from "./MessageBubble";

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

export interface HistoryPanelProps {
  /** 关闭面板回调 */
  onClose: () => void;
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const { t } = useLocale();
  const [view, setView] = useState<"list" | "transcript">("list");
  const [sessions, setSessions] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<ChatMessage[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  async function openHistory() {
    setView("list");
    setLoading(true);
    try {
      const data = await api<{ sessions: HistoryItem[] }>("/api/crm/chat/sessions/history?limit=20");
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function viewTranscript(item: HistoryItem) {
    setView("transcript");
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

  // 初始化加载
  useState(() => {
    openHistory();
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
      {view === "list" && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">{t("crmAssistantHistory")}</p>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 text-3xs text-slate-400 hover:text-teal-600"
            >
              <ArrowLeft className="w-3 h-3" /> {t("crmAssistantHistoryBack")}
            </button>
          </div>
          {loading && <p className="text-3xs text-slate-400 py-4 text-center">…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-3xs text-slate-400 py-6 text-center">{t("crmAssistantHistoryEmpty")}</p>
          )}
          <div className="space-y-2">
            {sessions.map((item) => (
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
        </>
      )}

      {view === "transcript" && (
        <>
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-3xs text-slate-500">{t("crmAssistantHistoryReadonly")}</span>
            <button
              type="button"
              onClick={() => setView("list")}
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
    </div>
  );
}

HistoryPanel.displayName = "HistoryPanel";
