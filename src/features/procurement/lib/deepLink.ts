/**
 * 公告详情深链工具
 *
 * @module features/procurement/lib/deepLink
 * @description 旧版列表页用 `?notice_id=<pk>` 打开内嵌详情；详情迁到独立路由后，
 *              这里只保留读取能力，用于把旧链接重定向到
 *              `/procurement/notice/<pk>/detail`。
 */

/** notice_id 深链参数名 */
export const NOTICE_ID_PARAM = "notice_id";

/** 从查询串解析旧深链公告主键；无/非法返回 null。 */
export function readNoticeIdParam(search: string): number | null {
  const raw = new URLSearchParams(search).get(NOTICE_ID_PARAM);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
