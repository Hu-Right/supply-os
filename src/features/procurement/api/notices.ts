/**
 * 采购公告搜索/详情 API
 * Notice search and detail API functions
 */
import type { NoticeResponse, NoticeItem, NoticeTranslation } from "../types";
import { api, apiCached, buildQuery } from "@/core/http";

/** 公采列表搜索/筛选参数 */
export interface NoticeSearchFilters {
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: "deadline" | "latest" | "deadline_farthest";
  userKey?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featured?: boolean;
  locale?: string;
}

export const fetchNotices = (
  params: { page: number; pageSize: number; codeId?: string } & NoticeSearchFilters,
  signal?: AbortSignal,
) => {
  const qs = buildQuery({
    page: params.page,
    page_size: params.pageSize,
    code_id: params.codeId,
    q: params.q,
    country: params.country,
    agency: params.agency,
    deadline_from: params.deadlineFrom,
    deadline_to: params.deadlineTo,
    sort: params.sort && params.sort !== "deadline_farthest" ? params.sort : undefined,
    user_key: params.userKey,
    deadline_within_days: params.deadlineWithinDays,
    notice_type: params.noticeType,
    featured: params.featured ? "1" : undefined,
    locale: params.locale,
  });
  return apiCached<NoticeResponse>(`/api/notices?${qs}`, 60 * 1000, signal);
};

export const fetchNoticeCountries = () =>
  apiCached<Array<{ country: string; count: number }>>("/api/notices/countries");

export const fetchNoticeAgencies = (locale?: string) => {
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return apiCached<Array<{ agency: string; count: number; agency_i18n?: string }>>(`/api/notices/agencies${qs}`);
};

export const viewNotice = (noticeId: number, userKey: string) =>
  api(`/api/notices/${noticeId}/view`, {
    method: "POST",
    body: { user_key: userKey },
  }).catch(() => undefined);

export const unlockNotice = (
  noticeId: number,
  userKey: string,
  unlockType: "free" | "single" | "subscription",
  price: number
) =>
  api(`/api/notices/${noticeId}/unlock`, {
    method: "POST",
    body: { user_key: userKey, unlock_type: unlockType, price },
  });

export const expressInterest = (
  noticeId: number,
  userKey: string,
  interestType: "interested" | "subscribed"
) =>
  api(`/api/notices/${noticeId}/interest`, {
    method: "POST",
    body: { user_key: userKey, interest_type: interestType },
  });

export const fetchNoticeDetail = (noticeId: number, userKey: string): Promise<NoticeItem> => {
  const url = `/api/notices/${noticeId}/detail?user_key=${encodeURIComponent(userKey)}`;
  return apiCached<NoticeItem>(url, 10 * 60 * 1000);
};

export const fetchNoticePreview = (noticeId: number, userKey: string): Promise<Partial<NoticeItem>> => {
  const url = `/api/notices/${noticeId}/preview?user_key=${encodeURIComponent(userKey)}`;
  return apiCached<Partial<NoticeItem>>(url, 10 * 60 * 1000);
};

export const fetchNoticeContent = (noticeId: number): Promise<{ description: string; title: string; description_cn: string }> => {
  const url = `/api/notices/${noticeId}/content`;
  return apiCached<{ description: string; title: string; description_cn: string }>(url, 10 * 60 * 1000);
};

export const fetchUnlockedNoticeIds = async (userKey: string): Promise<number[]> => {
  try {
    const rows = await apiCached<unknown[]>(`/api/notices/unlocks?user_key=${encodeURIComponent(userKey)}`, 5 * 60 * 1000);
    return Array.isArray(rows)
      ? rows.map((row) => Number((row as Record<string, unknown>)?.notice_id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
  } catch {
    return [];
  }
};

// 翻译 API 不使用 apiCached：后端已有数据库缓存（crm_notice_translations），
// 前端二次缓存会导致原文响应被缓存 5 分钟，即使后端翻译完成仍返回原文。
export const fetchNoticeTranslation = (noticeId: number, lang: string) =>
  api<NoticeTranslation>(
    `/api/notices/${noticeId}/translation?lang=${encodeURIComponent(lang)}`
  );

export const fetchRecommendedNotices = (params: {
  userKey: string;
  page: number;
  pageSize: number;
  locale?: string;
}, signal?: AbortSignal): Promise<NoticeResponse> => {
  const qs = buildQuery({
    user_key: params.userKey,
    page: params.page,
    page_size: params.pageSize,
    locale: params.locale,
  });
  return apiCached<NoticeResponse>(`/api/notices/recommended?${qs}`, 60 * 1000, signal);
};

/** 行业精准匹配列表（五级行业分层匹配，items 附带 match_score/match_tier） */
export const fetchIndustryMatchedNotices = (params: {
  userKey: string;
  page: number;
  pageSize: number;
  locale?: string;
  // 新增：全部筛选参数（与 fetchNotices 对齐）
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featured?: boolean;
  sort?: string;
}, signal?: AbortSignal): Promise<NoticeResponse> => {
  const qs = buildQuery({
    user_key: params.userKey,
    page: params.page,
    page_size: params.pageSize,
    locale: params.locale,
    q: params.q,
    country: params.country,
    agency: params.agency,
    deadline_from: params.deadlineFrom,
    deadline_to: params.deadlineTo,
    deadline_within_days: params.deadlineWithinDays,
    notice_type: params.noticeType,
    featured: params.featured ? "1" : undefined,
    sort: params.sort,
  });
  return apiCached<NoticeResponse>(`/api/notices/industry-matched?${qs}`, 60 * 1000, signal);
};
