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
  /** 内部用户 ID（Phase 2 user_id 迁移；跨表关联以此为准） */
  user_id: number | null;
  /** 登录凭据（旧列，仅兼容保留；不再用作关联键） */
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
  /** 满意度评价（迁移 064）：1-5 星 / 标签 / 可选文字 */
  satisfaction: number | null;
  satisfaction_tag: string | null;
  satisfaction_comment: string | null;
  rated_at: Date | null;
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

/**
 * 会话归属校验：优先比对 user_id（迁移 062 后的统一关联键），
 * 旧 token 无 userId 或历史行未回填时回退 customer_id。
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

export class ChatRepo {
  constructor(private pool: Pool) {}

  /** 创建客服会话（user_id 为主关联键，customer_id 双写兼容历史数据） */
  async createSession(params: {
    userId?: number | null;
    customerId: string;
    customerName?: string;
    leadId?: string;
    locale?: string;
    aiSummary?: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_chat_sessions (user_id, customer_id, customer_name, lead_id, locale, ai_summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.userId ?? null,
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

  /** 列出客户的活跃/等待会话（按 user_id 查询） */
  async listSessionsByCustomer(userId: number): Promise<ChatSessionRow[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM crm_chat_sessions
       WHERE user_id = ? AND status IN ('waiting', 'active')
       ORDER BY created_at DESC LIMIT 20`,
      [userId],
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

  /**
   * 提交满意度评价（迁移 064）。
   * 仅 closed 且未评价过的会话可提交；affectedRows = 0 表示不可评价
   * （会话不存在/未关闭/已评价过），由路由层区分提示。
   */
  async rateSession(
    sessionId: number,
    input: { satisfaction: number; tag?: string; comment?: string },
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE crm_chat_sessions
       SET satisfaction = ?, satisfaction_tag = ?, satisfaction_comment = ?, rated_at = NOW()
       WHERE id = ? AND status = 'closed' AND rated_at IS NULL`,
      [input.satisfaction, input.tag ?? null, input.comment ?? null, sessionId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /** 客户侧历史会话（closed），带最后一条消息预览与评分 */
  async listHistorySessions(
    userId: number,
    limit = 20,
    offset = 0,
  ): Promise<
    Array<
      Pick<
        ChatSessionRow,
        | "id" | "agent_email" | "status" | "mode" | "locale" | "ai_summary"
        | "created_at" | "accepted_at" | "closed_at" | "satisfaction"
      > & { last_message: string | null; message_count: number }
    >
  > {
    const [rows] = await this.pool.execute(
      `SELECT s.id, s.agent_email, s.status, s.mode, s.locale, s.ai_summary,
              s.created_at, s.accepted_at, s.closed_at, s.satisfaction,
              (SELECT m.content FROM crm_chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM crm_chat_messages m WHERE m.session_id = s.id) AS message_count
       FROM crm_chat_sessions s
       WHERE s.user_id = ? AND s.status = 'closed'
       ORDER BY s.closed_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );
    return rows as Array<
      Pick<
        ChatSessionRow,
        | "id" | "agent_email" | "status" | "mode" | "locale" | "ai_summary"
        | "created_at" | "accepted_at" | "closed_at" | "satisfaction"
      > & { last_message: string | null; message_count: number }
    >;
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
