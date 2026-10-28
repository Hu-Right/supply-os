/**
 * 公告数据访问层 — 统一导出入口
 * Notice repositories — unified export entry
 *
 * @module server/repos/notices
 * @description 按职责拆分的公告子 Repo 统一导出：
 *              - notice-detail: bid_notices（详情/预览/翻译源）
 *              - notice-unlock: opportunity_unlocks（解锁流水；额度记账见 benefit_quotas）
 *              - notice-translation: notice_translations
 *              - notice-interaction: user_notice_views + notice_interests
 *              - notice-feedback: user_reco_feedback + user_search_log
 *              - notice-favorite: notice_favorites
 */

export { NoticeDetailRepo } from "./notice-detail.repo";
export { NoticeUnlockRepo } from "./notice-unlock.repo";
export { NoticeTranslationRepo } from "./notice-translation.repo";
export { NoticeInteractionRepo } from "./notice-interaction.repo";
export { NoticeFeedbackRepo } from "./notice-feedback.repo";
export { NoticeFavoriteRepo } from "./notice-favorite.repo";
export type { RecoFeedbackItem } from "./notice-feedback.repo";
