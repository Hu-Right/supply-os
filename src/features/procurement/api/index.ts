/**
 * 采购模块 API — barrel re-export
 * Procurement module API — barrel re-export
 *
 * @description 原 api.ts 拆分为子模块：
 *              - notices.ts    公告搜索/详情/翻译/推荐（解锁 API 已随次数体系下线）
 *              - feedback.ts   推荐反馈采集
 *              - membership.ts 会员计划/状态
 */

export {
  fetchNoticeCountries,
  viewNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchNoticePreview,
  fetchNoticeContent,
  fetchNoticeTranslation,
  downloadNoticeReport,
  fetchUnifiedSearch,
  fetchSimilarNotices,
  toggleNoticeFavorite,
  fetchNoticeFavoriteIds,
  fetchNoticeFavorites,
} from "./notices";

export {
  sendNoticeFeedback,
  getFeedbackSessionId,
} from "./feedback";
export type { NoticeFeedbackAction, NoticeFeedbackItem } from "./feedback";

export {
  fetchMembershipPlans,
  fetchMembershipStatus,
} from "./membership";
