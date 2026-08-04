// 采购模块 API
import type {
  NoticeResponse,
  NoticeItem,
  MembershipPlan,
  MembershipStatus,
  NoticeTranslation,
} from "./types";
import { api, apiCached, buildQuery } from "@/core/http";

// ── 公采搜索功能（本地差异 #6 配套前端）──

/** 公采列表搜索/筛选参数（G.2 四参数 + T-B8 多维过滤；userKey 仅用于搜索行为落库，可缺省） */
export interface NoticeSearchFilters {
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: "deadline" | "latest";
  userKey?: string;
  /** T-B8（本地差异 #13）：截止窗口天数 / 采购类型关键词 */
  deadlineWithinDays?: number;
  noticeType?: string;
  /** T-A4（本地差异 #14）：只看精选（三路合格机会判定，服务端 featured=1） */
  // [精选功能重新启用 2026-07-31] 参数字段恢复（调用侧 useNoticeSearch 已同步恢复）
  featured?: boolean;
  /** 卡片国际化：当前 locale，服务端 LEFT JOIN 翻译表返回 title_i18n / description_i18n */
  locale?: string;
}

export const fetchNotices = (
  params: { page: number; pageSize: number; codeId?: string } & NoticeSearchFilters
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
    sort: params.sort && params.sort !== "deadline" ? params.sort : undefined,
    user_key: params.userKey,
    deadline_within_days: params.deadlineWithinDays,
    notice_type: params.noticeType,
    featured: params.featured ? "1" : undefined, // [精选功能重新启用 2026-07-31]
    locale: params.locale,
  });
  // P2 性能优化：搜索结果 30s 短 TTL 前端缓存——用户回退/条件回切时即时显示
  // 回滚：将 apiCached 替换回 api，删除第二个参数
  // 原注释：列表/搜索结果时效敏感（截止过滤与排序依赖服务端 NOW()），服务端已有 180s
  // TTL 缓存兜底性能；前端短缓存 30s 平衡时效性与重复请求消除
  return apiCached<NoticeResponse>(`/api/notices?${qs}`, 30 * 1000);
};

/** 在库有效公告的国家清单（按公告数降序，服务端缓存 10 分钟），搜索栏国家下拉数据源 */
export const fetchNoticeCountries = () =>
  apiCached<Array<{ country: string; count: number }>>("/api/notices/countries");

/** 在库有效公告的采购机构清单（按公告数降序，服务端缓存 10 分钟），搜索栏机构下拉数据源 */
export const fetchNoticeAgencies = () =>
  apiCached<Array<{ agency: string; count: number }>>("/api/notices/agencies");

export const fetchMembershipPlans = () =>
  apiCached<MembershipPlan[]>("/api/membership/plans");

export const fetchMembershipStatus = (userKey: string, useCache = false) => {
  const url = `/api/membership/status?user_key=${encodeURIComponent(userKey)}`;
  return useCache
    ? apiCached<MembershipStatus>(url)
    : api<MembershipStatus>(url);
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
  return apiCached<NoticeItem>(url, 10 * 60 * 1000); // 10 min TTL
};

/**
 * 获取锁定态公告的有限预览（渐进式信息展示）
 * Fetch the limited preview of a locked notice (progressive disclosure)
 *
 * @remarks 列表/推荐载荷出于商业保护将机构与分类置空；本端点为详情页锁定态
 *          补充机构名与前 4 个 UNSPSC 分类（VIP 额外获得机构全称与发布日期）。
 *          不含联系人/文件/报告等敏感字段；成功结果按 URL 缓存，失败不缓存。
 */
export const fetchNoticePreview = (noticeId: number, userKey: string): Promise<Partial<NoticeItem>> => {
  const url = `/api/notices/${noticeId}/preview?user_key=${encodeURIComponent(userKey)}`;
  return apiCached<Partial<NoticeItem>>(url, 10 * 60 * 1000); // 10 min TTL
};

/**
 * 拉取当前用户已解锁的公告 id 集合（详情首帧免闪烁判定用）
 * Fetch ids of notices already unlocked by the user (first-frame gating)
 *
 * @remarks 任何异常均返回空数组，不阻断采购页。
 */
export const fetchUnlockedNoticeIds = async (userKey: string): Promise<number[]> => {
  try {
    const rows = await api<unknown[]>(`/api/notices/unlocks?user_key=${encodeURIComponent(userKey)}`);
    return Array.isArray(rows)
      ? rows.map((row) => Number((row as Record<string, unknown>)?.notice_id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
  } catch {
    return [];
  }
};

/**
 * 获取公告标题/说明的按需译文（服务端缓存，同 URL 前端也只请求一次）
 * Fetch on-demand translation of a notice (server-side cached; deduped by URL)
 *
 * @remarks 标题与说明均为公开内容（列表端点对所有人返回完整 description），
 *          付费内容不经过本端点，故无需携带用户身份。
 */
export const fetchNoticeTranslation = (noticeId: number, lang: string) =>
  apiCached<NoticeTranslation>(
    `/api/notices/${noticeId}/translation?lang=${encodeURIComponent(lang)}`
  );

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
  /** 卡片国际化：当前 locale */
  locale?: string;
  // [dismiss 功能临时禁用 2026-07-30] excludeDismissed 参数已移除
  // excludeDismissed?: boolean;
}): Promise<NoticeResponse> => {
  const qs = buildQuery({
    user_key: params.userKey,
    page: params.page,
    page_size: params.pageSize,
    locale: params.locale,
  });
  // [dismiss 功能临时禁用 2026-07-30]
  return api<NoticeResponse>(`/api/notices/recommended?${qs}`);
};

// ── 推荐反馈采集（T-B9，本地差异 #13：D.7 前端侧）──

/** 反馈动作类型（与 server.ts VALID_ACTIONS 对齐；T-C7 隐式信号：dwell/scroll_end/quick_exit/revisit） */
export type NoticeFeedbackAction =
  | "impression"
  | "click"
  | "dismiss"
  | "favorite"
  | "dwell"
  | "scroll_end"
  | "quick_exit"
  | "revisit";

/** 单条反馈（notice_id + action，批量上报时逐条给出；variant 为推荐响应回传的 A/B 桶标记；dwell_ms 停留毫秒数，dwell/quick_exit 携带） */
export interface NoticeFeedbackItem {
  notice_id: number;
  action: NoticeFeedbackAction;
  variant?: string;
  dwell_ms?: number;
}

// 会话级 session_id：同一浏览器标签页会话内稳定，服务端按 (user, notice, action, session) 去重
const SESSION_ID_KEY = "supply-os:feedback-session-id";
export const getFeedbackSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    // 隐私模式等 sessionStorage 不可用时退化为进程内常量（刷新即新会话）
    return fallbackSessionId;
  }
};
const fallbackSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * 批量上报推荐反馈（曝光/点击/不感兴趣/收藏）
 * Report notice feedback actions in batch (impression/click/dismiss/favorite)
 *
 * @remarks 失败静默（埋点绝不阻断页面）；服务端幂等去重（INSERT IGNORE + 唯一键），
 *          同 session 同卡同动作重复上报无副作用。单批上限 50 条与服务端一致。
 */
export const sendNoticeFeedback = (
  userKey: string,
  actions: NoticeFeedbackItem[]
): Promise<void> => {
  if (!userKey || actions.length === 0) return Promise.resolve();
  return api("/api/notices/feedback", {
    method: "POST",
    body: {
      user_key: userKey,
      session_id: getFeedbackSessionId(),
      actions: actions.slice(0, 50),
    },
  })
    .then(() => undefined)
    .catch(() => undefined);
};
