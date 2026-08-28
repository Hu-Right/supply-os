/**
 * CRM 客服会话数据访问层
 * CRM Chat Repository
 *
 * @module repos/chat.repo
 * @description 管理数字人客服的会话与消息 CRUD
 *              Manages digital assistant chat sessions and messages CRUD
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

// ── 行类型 ──

export interface ChatSessionRow extends RowDataPacket {
  id: number;
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
}

export interface ChatMessageRow extends RowDataPacket {
  id: number;
  session_id: number;
  role: "customer" | "ai" | "agent";
  content: string;
  metadata: string | null;
  created_at: Date;
}

// ── Repo 实现 ──

export class ChatRepo {
  constructor(private pool: Pool) {}

  /** 创建客服会话 */
  async createSession(params: {
    customerId: string;
    customerName?: string;
    leadId?: string;
    locale?: string;
    aiSummary?: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_chat_sessions (customer_id, customer_name, lead_id, locale, ai_summary)
       VALUES (?, ?, ?, ?, ?)`,
      [
        params.customerId,
        params.customerName ?? null,
        params.leadId ?? null,
        params.locale ?? "en",
        params.aiSummary ?? null,
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  /** 按 ID 查询会话 */
  async findSessionById(sessionId: number): Promise<ChatSessionRow | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM crm_chat_sessions WHERE id = ? LIMIT 1",
      [sessionId],
    );
    return (rows as ChatSessionRow[])[0] ?? null;
  }

  /** 列出客户的活跃/等待会话 */
  async listSessionsByCustomer(customerId: string): Promise<ChatSessionRow[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM crm_chat_sessions
       WHERE customer_id = ? AND status IN ('waiting', 'active')
       ORDER BY created_at DESC LIMIT 20`,
      [customerId],
    );
    return rows as ChatSessionRow[];
  }

  /** 列出所有等待/活跃会话（运营经理视角） */
  async listActiveSessions(): Promise<ChatSessionRow[]> {
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_chat_sessions
       WHERE status IN ('waiting', 'active')
       ORDER BY status ASC, created_at DESC LIMIT 50`,
    );
    return rows as ChatSessionRow[];
  }

  /** 运营经理接入会话 */
  async acceptSession(sessionId: number, agentId: string, agentEmail: string): Promise<void> {
    await this.pool.execute(
      `UPDATE crm_chat_sessions
       SET status = 'active', mode = 'human', agent_id = ?, agent_email = ?, accepted_at = NOW()
       WHERE id = ?`,
      [agentId, agentEmail, sessionId],
    );
  }

  /** 关闭会话 */
  async closeSession(sessionId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_chat_sessions SET status = 'closed', closed_at = NOW() WHERE id = ?",
      [sessionId],
    );
  }

  /** 递增 AI 回复计数 */
  async incrementAiCount(sessionId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_chat_sessions SET ai_handled_count = ai_handled_count + 1, last_message_at = NOW() WHERE id = ?",
      [sessionId],
    );
  }

  /** 添加消息 */
  async insertMessage(params: {
    sessionId: number;
    role: "customer" | "ai" | "agent";
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_chat_messages (session_id, role, content, metadata)
       VALUES (?, ?, ?, ?)`,
      [
        params.sessionId,
        params.role,
        params.content,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
    // 同步更新会话的最后消息时间
    await this.pool.execute(
      "UPDATE crm_chat_sessions SET last_message_at = NOW() WHERE id = ?",
      [params.sessionId],
    );
    return (result as { insertId: number }).insertId;
  }

  /** 查询会话的消息列表 */
  async listMessages(sessionId: number, limit = 100): Promise<ChatMessageRow[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM crm_chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC LIMIT ?`,
      [sessionId, limit],
    );
    return rows as ChatMessageRow[];
  }

  /** 查询会话最后 N 条消息（用于 AI 上下文） */
  async listRecentMessages(sessionId: number, limit = 20): Promise<ChatMessageRow[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM (
         SELECT * FROM crm_chat_messages
         WHERE session_id = ?
         ORDER BY created_at DESC LIMIT ?
       ) sub ORDER BY created_at ASC`,
      [sessionId, limit],
    );
    return rows as ChatMessageRow[];
  }
}
