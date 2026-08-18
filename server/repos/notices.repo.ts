/**
 * 公告数据访问层 — 向后兼容聚合入口
 * Notices Repository — backward-compatible facade
 *
 * @module server/repos/notices.repo
 * @deprecated 已拆分至 notices/ 子目录。本文件保留 NoticesRepo 聚合类
 *             以维持 ctx.notice.noticesRepo.xxx 调用方的向后兼容。
 *             新代码请直接导入子 Repo（如 NoticeDetailRepo）。
 * @see notices/index.ts
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { NoticeDetailRepo } from "./notices/notice-detail.repo";
import { NoticeUnlockRepo } from "./notices/notice-unlock.repo";
import { NoticeTranslationRepo } from "./notices/notice-translation.repo";
import { NoticeInteractionRepo } from "./notices/notice-interaction.repo";
import { NoticeFeedbackRepo, type RecoFeedbackItem } from "./notices/notice-feedback.repo";

export type { RecoFeedbackItem } from "./notices/notice-feedback.repo";

/**
 * @deprecated 请使用子 Repo（NoticeDetailRepo / NoticeUnlockRepo 等）
 */
export class NoticesRepo {
  private detailRepo: NoticeDetailRepo;
  private unlockRepo: NoticeUnlockRepo;
  private translationRepo: NoticeTranslationRepo;
  private interactionRepo: NoticeInteractionRepo;
  private feedbackRepo: NoticeFeedbackRepo;

  constructor(private pool: Pool) {
    this.detailRepo = new NoticeDetailRepo(pool);
    this.unlockRepo = new NoticeUnlockRepo(pool);
    this.translationRepo = new NoticeTranslationRepo(pool);
    this.interactionRepo = new NoticeInteractionRepo(pool);
    this.feedbackRepo = new NoticeFeedbackRepo(pool);
  }

  // ── 委托至 NoticeDetailRepo ──
  findById(noticeId: number) { return this.detailRepo.findById(noticeId); }
  findUnspscSnapshots(noticeIds: number[]) { return this.detailRepo.findUnspscSnapshots(noticeIds); }
  findDetail(noticeId: number) { return this.detailRepo.findDetail(noticeId); }
  findPreview(noticeId: number) { return this.detailRepo.findPreview(noticeId); }
  findDescMeta(noticeId: number) { return this.detailRepo.findDescMeta(noticeId); }
  findForTranslation(noticeId: number) { return this.detailRepo.findForTranslation(noticeId); }

  // ── 委托至 NoticeUnlockRepo ──
  listNoticeUnlocks(userKey: string) { return this.unlockRepo.listNoticeUnlocks(userKey); }
  findExistingUnlock(userKey: string, noticeId: number) { return this.unlockRepo.findExistingUnlock(userKey, noticeId); }
  findUnlock(userKey: string, noticeId: number) { return this.unlockRepo.findUnlock(userKey, noticeId); }
  insertUnlock(params: { userKey: string; noticeId: number; unlockType: string; price: number; unspscSnapshot: string }) {
    return this.unlockRepo.insertUnlock(params);
  }
  consumeEntitlement(entitlementId: number) { return this.unlockRepo.consumeEntitlement(entitlementId); }

  // ── 委托至 NoticeTranslationRepo ──
  findTranslationCache(noticeId: number, lang: string) { return this.translationRepo.findTranslationCache(noticeId, lang); }
  updateTranslationDescription(noticeId: number, lang: string, descriptionTr: string, model: string) {
    return this.translationRepo.updateTranslationDescription(noticeId, lang, descriptionTr, model);
  }
  upsertTranslation(noticeId: number, lang: string, titleTr: string, descriptionTr: string | null, model: string) {
    return this.translationRepo.upsertTranslation(noticeId, lang, titleTr, descriptionTr, model);
  }
  hasTranslation(noticeId: number, lang: string) { return this.translationRepo.hasTranslation(noticeId, lang); }
  upsertEnPivotTranslation(noticeId: number, titleTr: string | null, descriptionTr: string | null, model: string) {
    return this.translationRepo.upsertEnPivotTranslation(noticeId, titleTr, descriptionTr, model);
  }

  // ── 委托至 NoticeInteractionRepo ──
  insertView(params: { userKey: string; noticeId: number; ip: string }) { return this.interactionRepo.insertView(params); }
  upsertInterest(params: { userKey: string; noticeId: number; interestType: string; note: string }) {
    return this.interactionRepo.upsertInterest(params);
  }

  // ── 委托至 NoticeFeedbackRepo ──
  insertRecoFeedback(userKey: string, sessionId: string, items: RecoFeedbackItem[]) {
    return this.feedbackRepo.insertRecoFeedback(userKey, sessionId, items);
  }
  logSearch(userKey: string, q: string | null, country: string | null, filters: string, resultCnt: number) {
    return this.feedbackRepo.logSearch(userKey, q, country, filters, resultCnt);
  }
}
