/**
 * 通知（站内信/收件箱）API client
 * @module core/api/notifications
 * @description 供顶栏铃铛使用；api() 自动附带 JWT。列表端点返回裸载荷 {items,total,unread,...}。
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
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unread: number;
}

/** 拉取收件箱首页（含未读数）。端点已返裸载荷，直接透传本体。 */
export async function fetchNotifications(pageSize = 20): Promise<NotificationList> {
  return api<NotificationList>(`/api/notifications?page_size=${pageSize}`);
}

/** 标记单条已读。 */
export async function markNotificationRead(id: number): Promise<void> {
  await api(`/api/notifications/${id}`, { method: "PATCH" });
}
