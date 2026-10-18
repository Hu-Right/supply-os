/**
 * 通知（站内信/收件箱）API client
 * @module core/api/notifications
 * @description 供顶栏铃铛使用；api() 自动附带 JWT。列表端点返回 {items,total,unread}。
 */
import { api } from "@/core/http";

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
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

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unread: number;
}

/** 拉取收件箱首页（含未读数）。 */
export async function fetchNotifications(pageSize = 20): Promise<NotificationList> {
  const res = await api<Envelope<NotificationList>>(`/api/notifications?page_size=${pageSize}`);
  return res.data;
}

/** 标记单条已读。 */
export async function markNotificationRead(id: number): Promise<void> {
  await api(`/api/notifications/${id}`, { method: "PATCH" });
}
