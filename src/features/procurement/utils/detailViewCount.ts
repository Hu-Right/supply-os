/**
 * 详情页本地查看计数
 * Detail View Count (localStorage)
 *
 * @module features/procurement/utils/detailViewCount
 * @description 免费详情查看次数的本地计数（按用户隔离），用于付费墙前置
 *              拦截；门槛与后端配额同源，真实配额以 membership.free_quota 为准。
 *              Local per-user detail view counter used for the pre-paywall
 *              gate; the real quota comes from membership.free_quota.
 */

const getDetailViewCountKey = (userKey: string | undefined) =>
  `procurement_detail_views_${userKey || "guest"}`;

export function getDetailViewCount(userKey: string | undefined): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(getDetailViewCountKey(userKey)) || 0);
}

export function setDetailViewCount(userKey: string | undefined, count: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getDetailViewCountKey(userKey), String(count));
}
