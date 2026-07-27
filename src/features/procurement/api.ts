// 采购模块 API
import type {
  UnspscOption,
  NoticeResponse,
  NoticeItem,
  MembershipPlan,
  MembershipStatus,
} from "./types";

const apiCache = new Map<string, Promise<any>>();

export const fetchJsonCached = <T,>(url: string): Promise<T> => {
  const cached = apiCache.get(url);
  if (cached) return cached;

  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });
  apiCache.set(url, request);
  request.catch(() => apiCache.delete(url));
  return request;
};

export const fetchUnspscIndustries = () =>
  fetchJsonCached<UnspscOption[]>("/api/unspsc/industries");

export const fetchUnspscChildren = (parentId: string) =>
  fetchJsonCached<UnspscOption[]>(`/api/unspsc/children?parent_id=${encodeURIComponent(parentId)}`);

export const fetchNotices = (params: { page: number; pageSize: number; codeId?: string }) => {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  });
  if (params.codeId) searchParams.set("code_id", params.codeId);
  return fetchJsonCached<NoticeResponse>(`/api/notices?${searchParams.toString()}`);
};

export const fetchMembershipPlans = () =>
  fetchJsonCached<MembershipPlan[]>("/api/membership/plans");

export const fetchMembershipStatus = (userKey: string, useCache = false) => {
  const url = `/api/membership/status?user_key=${encodeURIComponent(userKey)}`;
  return useCache
    ? fetchJsonCached<MembershipStatus>(url)
    : fetch(url).then((res) => res.json());
};

export const viewNotice = (noticeId: number, userKey: string) =>
  fetch(`/api/notices/${noticeId}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey }),
  }).catch(() => undefined);

export const unlockNotice = (
  noticeId: number,
  userKey: string,
  unlockType: "free" | "single" | "subscription",
  price: number
) =>
  fetch(`/api/notices/${noticeId}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey, unlock_type: unlockType, price }),
  });

export const expressInterest = (
  noticeId: number,
  userKey: string,
  interestType: "interested" | "subscribed"
) =>
  fetch(`/api/notices/${noticeId}/interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey, interest_type: interestType }),
  });

// 已解锁详情按 (notice, user) 会话级缓存：回列表再进同一公告零请求零闪烁
const noticeDetailCache = new Map<string, Promise<NoticeItem>>();

/**
 * 获取已解锁公告的完整详情
 * Fetch the full detail of an unlocked notice
 *
 * @remarks 需该用户已解锁该公告，否则后端返回 403 NOTICE_LOCKED。
 *          成功结果按 URL 缓存（同 notice+user 只请求一次），失败不缓存。
 *          Requires the notice to be unlocked for the user; successful
 *          results are cached per URL, failures are evicted.
 */
export const fetchNoticeDetail = (noticeId: number, userKey: string): Promise<NoticeItem> => {
  const url = `/api/notices/${noticeId}/detail?user_key=${encodeURIComponent(userKey)}`;
  const cached = noticeDetailCache.get(url);
  if (cached) return cached;

  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`NOTICE_DETAIL_${res.status}`);
    return res.json() as Promise<NoticeItem>;
  });
  noticeDetailCache.set(url, request);
  request.catch(() => noticeDetailCache.delete(url));
  return request;
};

/**
 * 拉取当前用户已解锁的公告 id 集合（详情首帧免闪烁判定用）
 * Fetch ids of notices already unlocked by the user (first-frame gating)
 *
 * @remarks 任何异常均返回空数组，不阻断采购页。
 */
export const fetchUnlockedNoticeIds = async (userKey: string): Promise<number[]> => {
  try {
    const res = await fetch(`/api/notices/unlocks?user_key=${encodeURIComponent(userKey)}`);
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows)
      ? rows.map((row) => Number(row?.notice_id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
  } catch {
    return [];
  }
};
