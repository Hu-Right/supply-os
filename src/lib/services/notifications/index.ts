/**
 * 站内信/收件箱服务
 *
 * @module lib/services/notifications
 * @description notifications 读写（系统此前无站内信设施，RFQ 闭环触达新建）。
 *              pushNotification 由业务事件调用，失败不应阻断主流程（调用方 try/catch 兜底）。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface PushNotificationInput {
  userId: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  refId?: number | null;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

/** 写入一条站内信，返回新行 id。 */
export async function pushNotification(
  dbPool: Pool,
  input: PushNotificationInput,
): Promise<number> {
  const [result] = await dbPool.query(
    `INSERT INTO notifications (user_id, type, title, body, link, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.type,
      String(input.title ?? "").slice(0, 200),
      input.body != null ? String(input.body).slice(0, 500) : null,
      input.link != null ? String(input.link).slice(0, 200) : null,
      input.refId ?? null,
    ],
  );
  return (result as ResultSetHeader).insertId;
}

/** 收件箱列表（按 id 倒序）。unreadOnly 仅取未读。 */
export async function listNotifications(
  dbPool: Pool,
  userId: number,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<{ items: NotificationItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const unreadOnly = Boolean(opts.unreadOnly);

  const where = "user_id = ?" + (unreadOnly ? " AND is_read = 0" : "");
  const [countRows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where}`,
    [userId],
  );
  const total = Number((countRows as RowDataPacket[])[0]?.total || 0);

  const [rows] = await dbPool.query(
    `SELECT id, type, title, body, link, is_read, created_at
       FROM notifications WHERE ${where}
      ORDER BY id DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  const items = (rows as RowDataPacket[]).map((r) => ({
    id: Number(r.id),
    type: String(r.type),
    title: String(r.title || ""),
    body: String(r.body || ""),
    link: String(r.link || ""),
    isRead: Number(r.is_read) === 1,
    createdAt: r.created_at != null ? String(r.created_at) : "",
  }));

  return { items, total };
}

/** 未读数。 */
export async function unreadCount(dbPool: Pool, userId: number): Promise<number> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
  return Number((rows as RowDataPacket[])[0]?.total || 0);
}

/** 标记单条已读（限本人）。返回是否命中。 */
export async function markRead(dbPool: Pool, userId: number, id: number): Promise<boolean> {
  const [result] = await dbPool.query(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return (result as ResultSetHeader).affectedRows > 0;
}
