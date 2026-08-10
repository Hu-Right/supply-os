/**
 * 采购模块 API — barrel re-export
 * Procurement module API — barrel re-export
 *
 * @description 原 api.ts 拆分为子模块：
 *              - notices.ts    公告搜索/详情/解锁/翻译/推荐
 *              - feedback.ts   推荐反馈采集
 *              - membership.ts 会员计划/状态
 */

export {
  fetchNotices,
  fetchNoticeCountries,
  fetchNoticeAgencies,
  viewNotice,
  unlockNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchNoticePreview,
  fetchNoticeContent,
  fetchUnlockedNoticeIds,
  fetchNoticeTranslation,
  fetchRecommendedNotices,
} from "./notices";
export type { NoticeSearchFilters } from "./notices";

export {
  sendNoticeFeedback,
  getFeedbackSessionId,
} from "./feedback";
export type { NoticeFeedbackAction, NoticeFeedbackItem } from "./feedback";

export {
  fetchMembershipPlans,
  fetchMembershipStatus,
} from "./membership";
