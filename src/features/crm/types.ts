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

/**
 * 客服消息对外视图（与 lib/services/chat-service 的 ChatMessageView 同一契约）
 * @description 这里不直接 import 服务端模块（chat-service 带 repo/mysql 类型，客户端引入是架构违规），
 *              而是镜像对外那一份。字段已从 DB 列名 session_id/created_at 改为 camelCase（命名红线②）；
 *              不再叫 …Row 是因为本对象不对应任何表行。
 */
export interface ChatMessageView {
  id: number;
  sessionId: number;
  role: "customer" | "ai" | "agent";
  content: string;
  metadata: string | null;
  createdAt: Date;
}
