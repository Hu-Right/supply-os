// CRM 模块类型定义

/**
 * 客服会话视图（镜像 lib/services/chat-service 的 ChatSessionView）。
 *
 * 对齐的是**对外视图**而不是 repo 行：列名（agent_email/created_at …）与
 * 内部标识列（user_id/customer_id/agent_id/assigned_*）都不再出现在响应里。
 * 时间字段写 string：服务端给 Date，经 JSON 序列化后就是 ISO 串。
 */
export interface ChatSessionView {
  id: number;
  status: "waiting" | "active" | "closed";
  mode: "ai" | "human" | "hybrid";
  locale: string;
  customerName: string | null;
  /** 客服署名（服务端取自 agent_email 列） */
  agentName: string | null;
  aiSummary: string | null;
  aiHandledCount: number;
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  lastMessageAt: string | null;
  satisfaction: number | null;
  satisfactionTag: string | null;
  satisfactionComment: string | null;
  ratedAt: string | null;
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
