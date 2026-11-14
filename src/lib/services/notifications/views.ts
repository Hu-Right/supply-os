/**
 * 站内通知响应视图
 *
 * @module lib/services/notifications/views
 * @description 收件箱响应必须经本域 mapper 出线（`check-api-field-naming` Rule WRAPPED-VALUE）：
 *              服务层返回的对象内部键静态面看不见，直接包进响应体等于绕过字段契约。
 *              这里显式列出对外键（camelCase），`payload` 原样透传（它是渲染参数，键名由通知类型定义）。
 */
import type { NotificationItem } from "./index";

export function notificationViewOf(n: NotificationItem) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt,
    payload: n.payload,
  };
}

/** 批量已读结果视图 */
export function markAllReadViewOf(marked: number) {
  return { marked };
}
/** 批量删除结果视图 */
export function deleteResultViewOf(deleted: number) {
  return { deleted };
}