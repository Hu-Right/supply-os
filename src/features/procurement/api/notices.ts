/**
 * 采购公告搜索/详情 API
 * Notice search and detail API functions
 */
import type { NoticeResponse, NoticeItem, NoticeTranslation } from "../types";
import { api, apiCached, buildQuery, downloadFile } from "@/core/http";

export const fetchNoticeCountries = () =>
  apiCached<Array<{ country: string; count: number }>>("/api/notices/countries");

export const fetchNoticeAgencies = (locale?: string) => {
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return apiCached<Array<{ agency: string; count: number; agency_i18n?: string }>>(`/api/notices/agencies${qs}`);
};

// B1 legacy 清理（2026-08-20）：身份一律由 JWT 承载（api() 自动携带），
// 不再拼装已废弃的 user_key 参数（服务端早已忽略该参数，且会污染 apiCached 的 URL 缓存 key）。
export const viewNotice = (noticeId: number) =>
  api(`/api/notices/${noticeId}/view`, {
    method: "POST",
    body: {},
  }).catch(() => undefined);

export const unlockNotice = (
  noticeId: number,
  unlockType: "free" | "single" | "subscription",
  price: number
) =>
  api(`/api/notices/${noticeId}/unlock`, {
    method: "POST",
    body: { unlock_type: unlockType, price },
  });

export const expressInterest = (
  noticeId: number,
  interestType: "interested" | "subscribed"
) =>
  api(`/api/notices/${noticeId}/interest`, {
    method: "POST",
    body: { interest_type: interestType },
  });

export const fetchNoticeDetail = (noticeId: number): Promise<NoticeItem> => {
  return apiCached<NoticeItem>(`/api/notices/${noticeId}/detail`, 10 * 60 * 1000);
};

export const fetchNoticePreview = (noticeId: number): Promise<Partial<NoticeItem>> => {
  return apiCached<Partial<NoticeItem>>(`/api/notices/${noticeId}/preview`, 10 * 60 * 1000);
};

export const fetchNoticeContent = (noticeId: number): Promise<{ description: string; title: string; description_cn: string }> => {
  const url = `/api/notices/${noticeId}/content`;
  return apiCached<{ description: string; title: string; description_cn: string }>(url, 10 * 60 * 1000);
};

export const fetchUnlockedNoticeIds = async (): Promise<number[]> => {
  try {
    const rows = await apiCached<unknown[]>("/api/notices/unlocks", 5 * 60 * 1000);
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

/**
 * 下载中文版订单拆解报告（Word 文档）
 * B1 配套修复（2026-08-20）：下载端点 requireAuth 仅认 JWT，纯 <a> 链接无法携带
 * Authorization 头（退役前依赖已废弃的 query user_key），改为带 Token 拉取 Blob 后本地保存。
 */
export async function downloadNoticeReport(reportUrl: string): Promise<void> {
  // 统一走 api-client 的 downloadFile 通道（自动携带 Bearer + Content-Disposition 文件名解析）
  await downloadFile(reportUrl, "report.docx");
}

/**
 * 统一搜索 API（重构方案 §4.1）：单一端点覆盖全量/行业匹配/推荐三种模式。
 * mode=default 全量搜索 / mode=prefs 行业精准匹配 / mode=recommended 行为推荐
 */
export const fetchUnifiedSearch = (params: {
  mode: "default" | "prefs" | "recommended";
  page: number;
  pageSize: number;
  locale?: string;
  codeId?: string;
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
  // B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，身份由 JWT 承载（api() 自动携带）
  const qs = buildQuery({
    mode: params.mode,
    page: params.page,
    page_size: params.pageSize,
    locale: params.locale,
    code_id: params.codeId,
    q: params.q,
    country: params.country,
    agency: params.agency,
    deadline_from: params.deadlineFrom,
    deadline_to: params.deadlineTo,
    deadline_within_days: params.deadlineWithinDays,
    notice_type: params.noticeType,
    featured: params.featured ? "1" : undefined,
    sort: params.sort && params.sort !== "deadline_farthest" ? params.sort : undefined,
  });
  return apiCached<NoticeResponse>(`/api/notices/unified-search?${qs}`, 60 * 1000, signal);
};
