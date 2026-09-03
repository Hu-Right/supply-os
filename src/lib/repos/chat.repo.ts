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

  /**
   * 运营经理接入会话
   * 审查 P0-B3：必须带状态机条件（仅 waiting 可接入），防止并发/重复接入
   * 覆盖已有认领信息。affectedRows = 0 表示会话不存在或已被接入/关闭。
   */
  async acceptSession(sessionId: number, agentId: string, agentEmail: string): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE crm_chat_sessions
       SET status = 'active', mode = 'human', agent_id = ?, agent_email = ?, accepted_at = NOW()
       WHERE id = ? AND status = 'waiting'`,
      [agentId, agentEmail, sessionId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
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

  /** 按 ID 精确查询单条消息（插入后回显用，审查 P0-B8） */
  async findMessageById(messageId: number): Promise<ChatMessageRow | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM crm_chat_messages WHERE id = ? LIMIT 1",
      [messageId],
    );
    return (rows as ChatMessageRow[])[0] ?? null;
  }

  /**
   * 增量查询：仅返回 id > afterId 的消息（SSE 轮询用）。
   * 审查 P0-B8：此前轮询取前 500 条再内存过滤，会话超 500 条后新消息被
   * 截断漏推；改为服务端 WHERE 过滤后无此上限。
   */
  async listMessagesAfter(sessionId: number, afterId: number, limit = 200): Promise<ChatMessageRow[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM crm_chat_messages
       WHERE session_id = ? AND id > ?
       ORDER BY id ASC LIMIT ?`,
      [sessionId, afterId, limit],
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

  // ── 排队信息（P1：waiting 横幅展示） ──

  /**
   * 查询指定 waiting 会话的排队信息：
   * - position：按 FIFO（created_at 升序）排第几位，1 = 下一个被接入
   * - agentsOnline：当前 online 状态的客服数（chat_agent_presence 由客服端维护）
   * - avgAcceptSeconds：最近 20 个已接入会话的平均等待时长（估预计等待用）
   */
  async getQueueInfo(sessionId: number): Promise<{
    position: number;
    agentsOnline: number;
    avgAcceptSeconds: number | null;
  }> {
    const [ahead] = await this.pool.execute(
      `SELECT COUNT(*) AS ahead FROM crm_chat_sessions
       WHERE status = 'waiting' AND created_at < (SELECT created_at FROM crm_chat_sessions WHERE id = ?)`,
      [sessionId],
    );
    const [online] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM chat_agent_presence WHERE status = 'online'`,
    );
    const [avg] = await this.pool.query(
      `SELECT AVG(wait_seconds) AS avg_seconds FROM (
         SELECT TIMESTAMPDIFF(SECOND, created_at, accepted_at) AS wait_seconds
         FROM crm_chat_sessions
         WHERE accepted_at IS NOT NULL
         ORDER BY accepted_at DESC LIMIT 20
       ) recent`,
    );

    return {
      position: Number((ahead as RowDataPacket[])[0]?.ahead ?? 0) + 1,
      agentsOnline: Number((online as RowDataPacket[])[0]?.total ?? 0),
      avgAcceptSeconds:
        (avg as RowDataPacket[])[0]?.avg_seconds != null
          ? Math.round(Number((avg as RowDataPacket[])[0].avg_seconds))
          : null,
    };
  }
}
