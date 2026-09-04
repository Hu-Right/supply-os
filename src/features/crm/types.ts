// CRM 模块类型定义

/** 客服会话行（与 lib/repos/chat.repo 的 ChatSessionRow 对齐，避免 features→lib 依赖） */
export interface ChatSessionRow {
  id: number;
  user_id: number | null;
  customer_id: string;
  customer_name: string | null;
  lead_id: string | null;
  agent_id: string | null;
  agent_email: string | null;
  status: "waiting" | "active" | "closed";
  mode: "ai" | "human" | "hybrid";
  ai_handled_count: number;
  locale: string;
  ai_summary: string | null;
  created_at: Date;
  accepted_at: Date | null;
  closed_at: Date | null;
  last_message_at: Date | null;
  satisfaction: number | null;
  satisfaction_tag: string | null;
  satisfaction_comment: string | null;
  rated_at: Date | null;
}

/** 客服消息行（与 lib/repos/chat.repo 的 ChatMessageRow 对齐） */
export interface ChatMessageRow {
  id: number;
  session_id: number;
  role: "customer" | "ai" | "agent";
  content: string;
  metadata: string | null;
  created_at: Date;
}
