/**
 * 消息列表组件
 * Chat Message List Component
 *
 * @module features/crm/components/DigitalAssistant/ChatMessageList
 * @description 渲染对话消息流，包含 AI 撮合选择器/报告卡片和输入指示器
 */

import { useRef, useEffect } from "react";
import type { ChatMessage, MatchPhase, AttachmentMeta } from "../../hooks/useDigitalAssistant";
import type { Supplier, Opportunity } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { MatchSelector } from "./MatchSelector";
import { MatchReportCard } from "./MatchReportCard";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  isThinking: boolean;
  matchPhase: MatchPhase;
  matchReport: string;
  suppliers: Supplier[];
  opportunities: Opportunity[];
  matchSupplier: Supplier | null;
  matchOpportunity: Opportunity | null;
  onSetMatchSupplier: (s: Supplier | null) => void;
  onSetMatchOpportunity: (o: Opportunity | null) => void;
  onTriggerMatch: () => void;
  t: (key: string) => string;
}

export function ChatMessageList({
  messages,
  isThinking,
  matchPhase,
  matchReport,
  suppliers,
  opportunities,
  matchSupplier,
  matchOpportunity,
  onSetMatchSupplier,
  onSetMatchOpportunity,
  onTriggerMatch,
  t,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
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
  );
}

ChatMessageList.displayName = "ChatMessageList";
