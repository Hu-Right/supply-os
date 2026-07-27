// 采购模块 API
import type {
  UnspscOption,
  NoticeResponse,
  NoticeItem,
  MembershipPlan,
  MembershipStatus,
  NoticeTranslation,
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

/**
 * 获取公告标题/说明的按需译文（服务端缓存，同 URL 前端也只请求一次）
 * Fetch on-demand translation of a notice (server-side cached; deduped by URL)
 */
export const fetchNoticeTranslation = (noticeId: number, lang: string) =>
  fetchJsonCached<NoticeTranslation>(
    `/api/notices/${noticeId}/translation?lang=${encodeURIComponent(lang)}`
  );

// ── 账号默认行业偏好（本地差异 #5 配套前端）──

/** 账号默认行业偏好：UNSPSC 类目路径 id（本期 UI 只用 1~2 级） */
export interface IndustryPrefs {
  level1_id: number | null;
  level2_id?: number | null;
  level3_id?: number | null;
  level4_id?: number | null;
  level5_id?: number | null;
}

/**
 * 读取账号默认行业偏好
 * Fetch the account's default industry preference
 *
 * @remarks 任何异常返回 null（回退到推荐/全量），绝不阻断公采页。
 *          偏好可在个人中心随时修改，故不走缓存。
 */
export const fetchIndustryPrefs = async (userKey: string): Promise<IndustryPrefs | null> => {
  try {
    const res = await fetch(`/api/user/industry-prefs?user_key=${encodeURIComponent(userKey)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.prefs || null;
  } catch {
    return null;
  }
};

/**
 * 保存账号默认行业偏好（level1_id 传空即清除偏好）
 * Save the account's default industry preference (null level1_id clears it)
 */
export const saveIndustryPrefs = (userKey: string, prefs: Partial<IndustryPrefs>) =>
  fetch("/api/user/industry-prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey, ...prefs }),
  });

/**
 * 按用户行为兴趣码拉取推荐公告（match_score 降序）
 * Fetch recommended notices ranked by the user's interest codes
 *
 * @remarks 兴趣码随解锁/订阅行为实时演进，故不走缓存，每次都请求最新结果。
 */
export const fetchRecommendedNotices = (params: {
  userKey: string;
  page: number;
  pageSize: number;
}): Promise<NoticeResponse> => {
  const searchParams = new URLSearchParams({
    user_key: params.userKey,
    page: String(params.page),
    page_size: String(params.pageSize),
  });
  return fetch(`/api/notices/recommended?${searchParams.toString()}`).then((res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });
};
