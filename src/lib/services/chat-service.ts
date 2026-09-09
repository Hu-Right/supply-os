/**
 * CRM 客服会话服务层
 * Chat Session Service
 *
 * @module lib/services/chat-service
 * @description 封装会话归属校验 + 高频操作组合，供 API 路由薄壳调用。
 *              消除路由层直接 import repo 的架构违规。
 */
import type { ChatRepo, ChatSessionRow, ChatMessageRow } from "@/lib/repos/chat.repo";

// ── 归属校验（从 chat.repo 提升至此，消除路由→repo 直连） ──

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

// ── 服务函数 ──

/**
 * 列出用户的活跃会话（waiting/active）
 */
export async function listUserSessions(chatRepo: ChatRepo, userId: number): Promise<ChatSessionRow[]> {
  return chatRepo.listSessionsByCustomer(userId);
}

/**
 * 创建或复用会话：已有 waiting/active 会话时直接复用
 */
export async function createOrReuseSession(
  chatRepo: ChatRepo,
  userId: number,
  params: { customerName: string; leadId?: string; locale?: string; aiSummary?: string },
): Promise<ChatSessionRow> {
  // 复用既有 waiting/active 会话
  const existing = await chatRepo.listSessionsByCustomer(userId);
  if (existing.length > 0) return existing[0];

  const sessionId = await chatRepo.createSession({
    userId,
    customerId: "",
    customerName: params.customerName,
    leadId: params.leadId,
    locale: params.locale,
    aiSummary: params.aiSummary,
  });

  return (await chatRepo.findSessionById(sessionId))!;
}

/**
 * 关闭会话（含归属校验）
 * @throws {{ status: number; code: number; message: string }}
 */
export async function closeSessionWithAuth(
  chatRepo: ChatRepo,
  sessionId: number,
  auth: { userId?: number | null },
): Promise<void> {
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) throw { status: 404, code: 40023, message: "会话不存在" };
  if (!sessionOwnedBy(session, auth)) throw { status: 403, code: 40003, message: "无权关闭此会话" };
  await chatRepo.closeSession(sessionId);
}

/**
 * 获取会话消息列表（含归属校验）
 */
export async function listMessagesWithAuth(
  chatRepo: ChatRepo,
  sessionId: number,
  auth: { userId?: number | null },
  limit: number,
): Promise<ChatMessageRow[]> {
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) throw { status: 404, code: 40040, message: "会话不存在" };
  if (!sessionOwnedBy(session, auth)) throw { status: 403, code: 40003, message: "无权访问此会话" };
  return chatRepo.listMessages(sessionId, limit);
}

/**
 * 发送客户消息（含归属校验 + 会话状态检查）
 */
export async function sendCustomerMessage(
  chatRepo: ChatRepo,
  sessionId: number,
  auth: { userId?: number | null },
  content: string,
  metadata?: Record<string, unknown>,
): Promise<ChatMessageRow> {
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) throw { status: 404, code: 40040, message: "会话不存在" };
  if (!sessionOwnedBy(session, auth)) throw { status: 403, code: 40003, message: "无权操作此会话" };
  if (session.status === "closed") throw { status: 409, code: 40901, message: "会话已结束" };

  // ai_handled_count 仅统计人工接入前（waiting）的客户消息
  if (session.status === "waiting") {
    await chatRepo.incrementAiCount(sessionId);
  }

  const messageId = await chatRepo.insertMessage({
    sessionId,
    role: "customer",
    content,
    metadata,
  });

  const createdMsg = await chatRepo.findMessageById(messageId);
  return createdMsg ?? {
    id: messageId,
    session_id: sessionId,
    role: "customer" as const,
    content,
    metadata: metadata ?? null,
    created_at: new Date(),
  } as ChatMessageRow;
}

/**
 * 提交满意度评价（含归属校验）
 */
export async function rateSessionWithAuth(
  chatRepo: ChatRepo,
  sessionId: number,
  auth: { userId?: number | null },
  input: { satisfaction: number; tag?: string; comment?: string },
): Promise<void> {
  const session = await chatRepo.findSessionById(sessionId);
  if (!session) throw { status: 404, code: 40023, message: "会话不存在" };
  if (!sessionOwnedBy(session, auth)) throw { status: 403, code: 40003, message: "无权评价此会话" };

  const ok = await chatRepo.rateSession(sessionId, input);
  if (!ok) throw { status: 409, code: 40901, message: "会话未结束或已评价过" };
}
