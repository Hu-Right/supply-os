/**
 * 通知（站内信/收件箱）API client
 * @module core/api/notifications
 * @description 供顶栏铃铛与 /notifications 收件箱共用；api() 自动附带 JWT。
 *              列表返回裸载荷 { items, total, unread, page, pageSize }。
 *              `payload` 是该通知的渲染参数（前端按 type 渲染多语言文案）。
 */
import { api } from "@/core/http";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unread: number;
  page?: number;
  pageSize?: number;
}

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  /** 类型族前缀：`procurement.` / `buyer.`；不传=全部 */
  typePrefix?: string | null;
  /** 精确类型集合（分类 tab 用）；为空则不限 */
  types?: string[] | null;
}

/** 收件箱列表（含全站未读数）。 */
export async function fetchNotifications(query: NotificationQuery = {}): Promise<NotificationList> {
  const q = new URLSearchParams();
  q.set("page_size", String(query.pageSize ?? 20));
  if (query.page) q.set("page", String(query.page));
  if (query.unreadOnly) q.set("unread_only", "1");
  if (query.typePrefix) q.set("type_prefix", query.typePrefix);
  if (query.types && query.types.length > 0) q.set("types", query.types.join(","));
  return api<NotificationList>(`/api/notifications?${q.toString()}`);
}

/** 单条详情（限本人）。 */
export async function fetchNotification(id: number): Promise<NotificationItem> {
  const r = await api<{ item: NotificationItem }>(`/api/notifications/${id}`);
  return r.item;
}

/** 标记单条已读（幂等）。 */
export async function markNotificationRead(id: number): Promise<void> {
  await api(`/api/notifications/${id}`, { method: "PATCH" });
}

interface BatchScope {
  ids?: number[];
  types?: string[] | null;
}

/** 批量标记已读（ids 或按筛选全部）。返回命中条数。 */
export async function markNotificationsRead(scope: BatchScope & { all?: boolean }): Promise<number> {
  const r = await api<{ marked: number }>("/api/notifications", {
    method: "POST",
    body: {
      action: scope.all ? "mark_all_read" : "mark_read",
      ...(scope.ids ? { ids: scope.ids } : {}),
      ...(scope.types && scope.types.length ? { types: scope.types } : {}),
    },
  });
  return Number(r.marked ?? 0);
}

/** 批量软删（ids 或按筛选全部）。返回删除条数。 */
export async function deleteNotifications(scope: BatchScope & { all?: boolean }): Promise<number> {
  const r = await api<{ deleted: number }>("/api/notifications", {
    method: "POST",
    body: {
      action: scope.all ? "delete_all" : "delete",
      ...(scope.ids ? { ids: scope.ids } : {}),
      ...(scope.types && scope.types.length ? { types: scope.types } : {}),
    },
  });
  return Number(r.deleted ?? 0);
}

