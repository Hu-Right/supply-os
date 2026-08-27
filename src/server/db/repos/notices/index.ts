/**
 * 公告数据访问层 — 统一导出入口
 * Notice repositories — unified export entry
 *
 * @module server/repos/notices
 * @description 按职责拆分的公告子 Repo 统一导出：
 *              - notice-detail: crm_bid_notices（详情/预览/翻译源）
 *              - notice-unlock: crm_opportunity_unlocks + crm_user_entitlements
 *              - notice-translation: crm_notice_translations
 *              - notice-interaction: crm_user_notice_views + crm_notice_interests
 *              - notice-feedback: crm_user_reco_feedback + crm_user_search_log
 */
import "server-only";

export { NoticeDetailRepo } from "./notice-detail.repo";
export { NoticeUnlockRepo } from "./notice-unlock.repo";
export { NoticeTranslationRepo } from "./notice-translation.repo";
export { NoticeInteractionRepo } from "./notice-interaction.repo";
export { NoticeFeedbackRepo } from "./notice-feedback.repo";
export type { RecoFeedbackItem } from "./notice-feedback.repo";
