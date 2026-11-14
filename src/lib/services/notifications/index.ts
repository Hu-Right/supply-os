/**
 * 站内信/收件箱服务
 *
 * @module lib/services/notifications
 * @description notifications 读写。2026-11 改造：
 *              ① 通知文案不再由后端拼中文 —— 存 `type` + `payload`（参数 JSON），前端按 type
 *                 渲染 `t()`；`title`/`body` 仅作兜底快照（旧数据或未知类型）。
 *              ② 补 `dedupeKey` 幂等：回调会重试（超时/后台重发），同一事件只发一次；
 *                 命中既是重复投递，返回 0 而不报错。
 *              ③ 写入失败不应阻断主流程（调用方 try/catch 兜底，见 pushNotificationSafe）。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface PushNotificationInput {
  userId: number;
  /** 稳定类型码，如 procurement.published / buyer.verified（前端据此渲染多语言文案） */
  type: string;
  /** 兜底标题/正文：类型未知或旧数据时直接显示 */
  title: string;
  body?: string | null;
  link?: string | null;
  refId?: number | null;
  /** 渲染参数（reference / tenderNo / reason / count 等） */
  payload?: Record<string, unknown> | null;
  /** 事件幂等键；同一键重复投递只落一条（NULL=不参与去重） */
  dedupeKey?: string | null;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
  payload: Record<string, unknown> | null;
}

/** 把 JSON 列读成对象（mysql2 对 JSON 列可能返回字符串或已解析对象） */
function asPayload(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "object") return v as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(v));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 时间列归一：mysql2 不开 `dateStrings` 时 DATETIME 是 `Date`，`String()` 会得到
 * `Sat Nov 14 2026 23:03:48 GMT+0800 (...)` 这种 `Date.toString()` 形态。
 * 对外统一 ISO，前端 `new Date()` 才能稳定解析。
 */
function asIsoTime(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v);
}

/**
 * 写入一条站内信，返回新行 id（重复投递返回 0）。
 * 调用方应在业务成功之后调用；导航式副作用（跳转链接）由 `link` 携带。
 */
export async function pushNotification(
  dbPool: Pool,
  input: PushNotificationInput,
): Promise<number> {
  try {
    const [result] = await dbPool.query(
      `INSERT INTO notifications (user_id, type, title, body, link, ref_id, payload, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        String(input.type).slice(0, 32),
        String(input.title ?? "").slice(0, 200),
        input.body != null ? String(input.body).slice(0, 500) : null,
        input.link != null ? String(input.link).slice(0, 200) : null,
        input.refId ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        input.dedupeKey != null ? String(input.dedupeKey).slice(0, 96) : null,
      ],
    );
    return (result as ResultSetHeader).insertId;
  } catch (err) {
    // 唯一键冲突 = 同一事件重试，静默视为已发
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return 0;
    throw err;
  }
}

/** 写入站内信但不影响主流程：失败只记 warn（发布/核验这类动作不能被通知故障拖垮） */
export async function pushNotificationSafe(
  dbPool: Pool,
  input: PushNotificationInput,
): Promise<number> {
  try {
    return await pushNotification(dbPool, input);
  } catch (err) {
    console.warn("[notifications] 站内信写入失败（不影响主流程）:", (err as Error).message);
    return 0;
  }
}

/** 收件箱列表（按 id 倒序）。unreadOnly 仅取未读；typePrefix/types 按类型过滤；软删的不可见。 */
export async function listNotifications(
  dbPool: Pool,
  userId: number,
  opts: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    typePrefix?: string | null;
    /** 精确类型集合（多个分类 tab 用），为空则不限 */
    types?: string[] | null;
  } = {},
): Promise<{ items: NotificationItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const unreadOnly = Boolean(opts.unreadOnly);
  const typePrefix = opts.typePrefix ? String(opts.typePrefix) : "";
  const types = (opts.types ?? []).filter(Boolean).map((x) => String(x).slice(0, 32));

  const params: unknown[] = [userId];
  let where = "user_id = ? AND deleted_at IS NULL";
  if (unreadOnly) where += " AND is_read = 0";
  if (typePrefix) {
    where += " AND type LIKE ?";
    params.push(`${typePrefix}%`);
  }
  if (types.length > 0) {
    where += ` AND type IN (${types.map(() => "?").join(",")})`;
    params.push(...types);
  }

  const [countRows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where}`,
    params,
  );
  const total = Number((countRows as RowDataPacket[])[0]?.total || 0);

  const [rows] = await dbPool.query(
    `SELECT id, type, title, body, link, is_read, created_at, payload
       FROM notifications WHERE ${where}
      ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const items = (rows as RowDataPacket[]).map((r) => ({
    id: Number(r.id),
    type: String(r.type),
    title: String(r.title || ""),
    body: String(r.body || ""),
    link: String(r.link || ""),
    isRead: Number(r.is_read) === 1,
    createdAt: asIsoTime(r.created_at),
    payload: asPayload(r.payload),
  }));

  return { items, total };
}

/** 单条（限本人）：详情页用。 */
export async function getNotification(
  dbPool: Pool,
  userId: number,
  id: number,
): Promise<NotificationItem | null> {
  const [rows] = await dbPool.query(
    `SELECT id, type, title, body, link, is_read, created_at, payload
       FROM notifications WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId],
  );
  const r = (rows as RowDataPacket[])[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    type: String(r.type),
    title: String(r.title || ""),
    body: String(r.body || ""),
    link: String(r.link || ""),
    isRead: Number(r.is_read) === 1,
    createdAt: asIsoTime(r.created_at),
    payload: asPayload(r.payload),
  };
}

/** 未读数。 */
export async function unreadCount(dbPool: Pool, userId: number): Promise<number> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL`,
    [userId],
  );
  return Number((rows as RowDataPacket[])[0]?.total || 0);
}

/** 标记单条已读（限本人）。返回是否命中。 */
export async function markRead(dbPool: Pool, userId: number, id: number): Promise<boolean> {
  const [result] = await dbPool.query(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  return (result as ResultSetHeader).affectedRows > 0;
}

/** 全部标为已读（可按类型族 / 类型集合限定）。返回本次标记条数。 */
export async function markAllRead(
  dbPool: Pool,
  userId: number,
  opts: { typePrefix?: string | null; types?: string[] | null } = {},
): Promise<number> {
  const params: unknown[] = [userId];
  let where = "user_id = ? AND is_read = 0 AND deleted_at IS NULL";
  if (opts.typePrefix) {
    where += " AND type LIKE ?";
    params.push(`${String(opts.typePrefix)}%`);
  }
  const types = (opts.types ?? []).filter(Boolean);
  if (types.length > 0) {
    where += ` AND type IN (${types.map(() => "?").join(",")})`;
    params.push(...types);
  }
  const [result] = await dbPool.query(`UPDATE notifications SET is_read = 1 WHERE ${where}`, params);
  return (result as ResultSetHeader).affectedRows;
}

/** 批量标记已读（仅本人、仅未删）。返回命中条数。 */
export async function markReadMany(dbPool: Pool, userId: number, ids: number[]): Promise<number> {
  const list = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 200);
  if (list.length === 0) return 0;
  const [result] = await dbPool.query(
    `UPDATE notifications SET is_read = 1
      WHERE user_id = ? AND deleted_at IS NULL AND id IN (${list.map(() => "?").join(",")})`,
    [userId, ...list],
  );
  return (result as ResultSetHeader).affectedRows;
}

/**
 * 软删（ids 为空数组表示按筛选全部删除：`all=true`）。
 * 只标 deleted_at，不物理删除——保留"曾发过什么"的审计事实。
 */
export async function deleteNotifications(
  dbPool: Pool,
  userId: number,
  opts: { ids?: number[] | null; all?: boolean; typePrefix?: string | null; types?: string[] | null } = {},
): Promise<number> {
  const params: unknown[] = [userId];
  let where = "user_id = ? AND deleted_at IS NULL";
  if (opts.typePrefix) {
    where += " AND type LIKE ?";
    params.push(`${String(opts.typePrefix)}%`);
  }
  const types = (opts.types ?? []).filter(Boolean);
  if (types.length > 0) {
    where += ` AND type IN (${types.map(() => "?").join(",")})`;
    params.push(...types);
  }
  if (!opts.all) {
    const list = (opts.ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 200);
    if (list.length === 0) return 0;
    where += ` AND id IN (${list.map(() => "?").join(",")})`;
    params.push(...list);
  }
  const [result] = await dbPool.query(
    `UPDATE notifications SET deleted_at = NOW() WHERE ${where}`,
    params,
  );
  return (result as ResultSetHeader).affectedRows;
}

