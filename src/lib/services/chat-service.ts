/**
 * CRM 客服会话服务层
 * Chat Session Service
 *
 * @module lib/services/chat-service
 * @description 只提供**实际被调用**的两件能力：会话归属校验 sessionOwnedBy（六个 chat 路由在用）
 *              与消息对外视图 messageViewOf / messagesViewOf（命名红线② 的收口点）。
 *              本层原本还有一批「服务函数」包装，它们声称已消除路由→repo 直连，但全仓零调用方
 *              （详见文件末尾清理记录）；2026-10-27 已删。**注：路由仍直接 import repo 这条架构违规
 *              仍然存在**，要修得先让路由改调本层，而不是留无人用的副本当装饰。
 */
import type { ChatSessionRow, ChatMessageRow } from "@/lib/repos/chat.repo";

// ── 归属校验（从 chat.repo 提升至此，消除路由→repo 直连） ──

/**
 * 消息对外视图（命名红线② 的收口点）
 * @description DB 行（ChatMessageRow）的 `session_id`/`created_at` 是 chat_messages 列名，
 *              不得直接当对外契约。本层只**归位键名**，值原样透传（created_at 仍是驱动返回的
 *              Date/字符串），因此响应字节与形状变化无关——避免“改名”顺带改了时间格式这种隐性行为变更。
 *              三个出口（GET 列表、POST 回显、SSE 推送）必须统一走这里，否则同一对象会分裂成两种命名。
 */
export interface ChatMessageView {
  id: number;
  sessionId: number;
  role: "customer" | "ai" | "agent";
  content: string;
  /** DB JSON 列原样透传（驱动可能给字符串或对象） */
  metadata: string | null;
  createdAt: Date;
}

export function messageViewOf(row: ChatMessageRow): ChatMessageView {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/** 批量出口（GET 列表与 SSE 增量都用它） */
export const messagesViewOf = (rows: ChatMessageRow[]): ChatMessageView[] => rows.map(messageViewOf);

// ── 会话对外视图（命名红线② 的收口点） ────────────────────────────

/**
 * 会话对外视图。
 * @description repo 用 SELECT * 拉 chat_sessions，列名（user_id / customer_id /
 *              agent_id / agent_email / assigned_uid / assigned_at / ai_handled_count …）
 *              会直接变成响应键。本视图只做两件事：
 *              1) 键名归位 camelCase（值原样透传，时间仍是驱动给的 Date，序列化结果不变）；
 *              2) 内部标识列不外发：user_id / customer_id / customer 侧无需的 agent_id /
 *                  assigned_uid / assigned_at / lead_id 都不进出参（客服署名用 agentName，
 *                  值就是 agent_email，客户端拿到它直接当显示名）。
 */
export interface ChatSessionView {
  id: number;
  status: ChatSessionRow["status"];
  mode: ChatSessionRow["mode"];
  locale: string;
  customerName: string | null;
  /** 客服署名（取自 agent_email 列） */
  agentName: string | null;
  aiSummary: string | null;
  aiHandledCount: number;
  createdAt: Date;
  acceptedAt: Date | null;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  satisfaction: number | null;
  satisfactionTag: string | null;
  satisfactionComment: string | null;
  ratedAt: Date | null;
}

export function sessionViewOf(row: ChatSessionRow): ChatSessionView {
  return {
    id: Number(row.id),
    status: row.status,
    mode: row.mode,
    locale: row.locale,
    customerName: row.customer_name ?? null,
    agentName: row.agent_email ?? null,
    aiSummary: row.ai_summary ?? null,
    aiHandledCount: Number(row.ai_handled_count ?? 0),
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? null,
    closedAt: row.closed_at ?? null,
    lastMessageAt: row.last_message_at ?? null,
    satisfaction: row.satisfaction ?? null,
    satisfactionTag: row.satisfaction_tag ?? null,
    satisfactionComment: row.satisfaction_comment ?? null,
    ratedAt: row.rated_at ?? null,
  };
}

/** 会话列表/单条回显共用（POST 回显不能与 GET 列表分裂成两种命名） */
export const sessionsViewOf = (rows: ChatSessionRow[]): ChatSessionView[] => rows.map(sessionViewOf);

/**
 * 历史会话对外视图（GET /api/crm/chat/sessions/history）。
 * 行由 listHistorySessions 的显式列 + 两个子查询组成；口径与 ChatSessionView 一致。
 */
export interface ChatHistorySessionView {
  id: number;
  status: ChatSessionRow["status"];
  mode: ChatSessionRow["mode"];
  locale: string;
  agentName: string | null;
  aiSummary: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  closedAt: Date | null;
  satisfaction: number | null;
  /** 最后一条消息预览（列表子查询） */
  lastMessage: string | null;
  messageCount: number;
}

export function historySessionViewOf(
  row: Pick<
    ChatSessionRow,
    | "id" | "agent_email" | "status" | "mode" | "locale" | "ai_summary"
    | "created_at" | "accepted_at" | "closed_at" | "satisfaction"
  > & { last_message: string | null; message_count: number },
): ChatHistorySessionView {
  return {
    id: Number(row.id),
    status: row.status,
    mode: row.mode,
    locale: row.locale,
    agentName: row.agent_email ?? null,
    aiSummary: row.ai_summary ?? null,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? null,
    closedAt: row.closed_at ?? null,
    satisfaction: row.satisfaction ?? null,
    lastMessage: row.last_message ?? null,
    messageCount: Number(row.message_count ?? 0),
  };
}

export const historySessionsViewOf = (
  rows: Array<Pick<
    ChatSessionRow,
    | "id" | "agent_email" | "status" | "mode" | "locale" | "ai_summary"
    | "created_at" | "accepted_at" | "closed_at" | "satisfaction"
  > & { last_message: string | null; message_count: number }>,
): ChatHistorySessionView[] => rows.map(historySessionViewOf);

/**
 * 会话归属校验：优先比对 user_id（迁移 062 后的统一关联键）。
 * 从 chat.repo 提升至此，供路由层薄壳调用。
 */
export function sessionOwnedBy(
  session: Pick<ChatSessionRow, "user_id" | "customer_id">,
  auth: { userId?: number | null },
): boolean {
  if (session.user_id != null && auth.userId != null) {
    return session.user_id === auth.userId;
  }
  return false;
}

// ── 死码清理记录（2026-10-27）───────────────────────────────────────
// 本文件原有六个导出函数，声明后全仓零调用方（含被 gitignore 的 scripts/ops 逐文件核过）：
//   listUserSessions / createOrReuseSession
//     → sessions 路由自己调 chatRepo.listSessionsByCustomer / createSession + findSessionById
//   closeSessionWithAuth
//     → 关闭会话的路由自己走 findSessionById + sessionOwnedBy + closeSession
//   listMessagesWithAuth / sendCustomerMessage
//     → crm/chat/messages 的 GET/POST 自己内联同样两步校验（POST 含 incrementAiCount 与回查兜底）
//   rateSessionWithAuth
//     → sessions/rate 路由直接调 chatRepo.rateSession
// 它们与路由里的现行写法是**同一逻辑的两份副本**，留着就是「改一处忘另一处」的双口径隐患；
// 删后仅剩 sessionOwnedBy + 消息视图， import 也随之从四个 EC_* 收敛到零。
