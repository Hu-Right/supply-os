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
  return apiCached<Array<{ agency: string; count: number; agencyI18n?: string }>>(`/api/notices/agencies${qs}`);
};

// B1 legacy 清理（2026-08-20）：身份一律由 JWT 承载（api() 自动携带），
// 不再拼装已废弃的 user_key 参数（服务端早已忽略该参数，且会污染 apiCached 的 URL 缓存 key）。
export const viewNotice = (noticeId: number) =>
  api(`/api/notices/${noticeId}/view`, {
    method: "POST",
    body: {},
  }).catch((e) => console.warn("[Notices] 浏览记录上报失败:", e));

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

/** 详情/预览的机构名与平台名按界面语言下发（统一中文 2026-10-28）：
 *  locale 走查询参而非请求头，因为 apiCached 以 URL 为键——不进 URL 就会
 *  在切换语言后继续复用上一语言的 10 分钟缓存。 */
export const fetchNoticeDetail = (noticeId: number, locale?: string): Promise<NoticeItem> => {
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return apiCached<NoticeItem>(`/api/notices/${noticeId}/detail${qs}`, 10 * 60 * 1000);
};

export const fetchNoticePreview = (noticeId: number, locale?: string): Promise<Partial<NoticeItem>> => {
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return apiCached<Partial<NoticeItem>>(`/api/notices/${noticeId}/preview${qs}`, 10 * 60 * 1000);
};

/** 公告全文端点的响应（命名红线②：响应键 camelCase；与 NoticeItem 内部 snake 字段不同名） */
export interface NoticeContentResult {
  description: string;
  title: string;
  descriptionCn: string;
  originalDescription?: string;
}

export const fetchNoticeContent = (noticeId: number): Promise<NoticeContentResult> => {
  const url = `/api/notices/${noticeId}/content`;
  return apiCached<NoticeContentResult>(url, 10 * 60 * 1000);
};

export const fetchUnlockedNoticeIds = async (): Promise<number[]> => {
  try {
    const rows = await apiCached<unknown[]>("/api/notices/unlocks", 5 * 60 * 1000);
    return Array.isArray(rows)
      ? rows.map((row) => Number((row as Record<string, unknown>)?.noticeId)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
  } catch {
    return [];
  }
};

// 翻译 API 不使用 apiCached：后端已有数据库缓存（notice_translations），
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
  /** 品目大类码（UGT-G-xx，32 类之一） */
  /** 品目树筛选键（UGT 节点码，五级下拉第二~五级）——与大类同一条链的收窄 */
  commodityPath?: string;
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featured?: boolean;
  sort?: string;
  budgetMin?: number;
  budgetMax?: number;
  /** 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中） */
  matchMode?: "all" | "any";
}, signal?: AbortSignal): Promise<NoticeResponse> => {
  // B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，身份由 JWT 承载（api() 自动携带）
  const qs = buildQuery({
    mode: params.mode,
    page: params.page,
    page_size: params.pageSize,
    locale: params.locale,
    commodity: params.commodityPath,
    q: params.q,
    country: params.country,
    agency: params.agency,
    deadline_from: params.deadlineFrom,
    deadline_to: params.deadlineTo,
    deadline_within_days: params.deadlineWithinDays,
    notice_type: params.noticeType,
    featured: params.featured ? "1" : undefined,
    sort: params.sort && params.sort !== "latest" ? params.sort : undefined,
    budget_min: params.budgetMin?.toString(),
    budget_max: params.budgetMax?.toString(),
    match_mode: params.matchMode === "any" ? "any" : undefined,
  });
  return apiCached<NoticeResponse>(`/api/notices/unified-search?${qs}`, 60 * 1000, signal);
};

/**
 * 相似公告（按 旧品类品类语义相似，最多 limit 条；无同类返回空数组，服务端不做兜底）
 */
export const fetchSimilarNotices = (
  noticeId: number, limit = 6, locale?: string, signal?: AbortSignal,
): Promise<NoticeResponse> => {
  const qs = buildQuery({ limit, locale });
  return apiCached<NoticeResponse>(`/api/notices/${noticeId}/similar?${qs}`, 60 * 1000, signal);
};

// ── 收藏（用户私有书签） ──

/** 收藏/取消收藏（toggle，返回切换后的状态） */
export const toggleNoticeFavorite = (noticeId: number) =>
  api<{ favorited: boolean }>(`/api/notices/${noticeId}/favorite`, { method: "POST" });

/** 用户已收藏的公告 id 集合（状态回显，不走缓存保证即时性） */
export const fetchNoticeFavoriteIds = () =>
  api<{ ids: number[] }>("/api/notices/favorites/ids");

/** 我的收藏（分页，按收藏时间倒序）——条目与搜索列表同一视图口径（noticePk / countryCode / buyerName / deadlineTs…） */
export const fetchNoticeFavorites = (params: { page?: number; limit?: number } = {}) =>
  api<{ total: number; page: number; limit: number; list: NoticeItem[] }>(
    `/api/notices/favorites?page=${params.page ?? 1}&limit=${params.limit ?? 20}`,
  );
