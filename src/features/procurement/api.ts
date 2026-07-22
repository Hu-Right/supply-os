// 采购模块 API
import type {
  UnspscOption,
  NoticeResponse,
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
