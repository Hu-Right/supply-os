/**
 * 公告交互服务层
 * Notice Interaction Service
 *
 * @module lib/services/notice-service
 * @description 封装公告浏览/意向/解锁列表等高频操作，供 API 路由薄壳调用。
 *              消除路由层直接 import NoticeInteractionRepo / NoticeUnlockRepo 的架构违规。
 *              同时为已有 service 函数（submitInterest/executeUnlock/processFeedback/
 *              getNoticeTranslation）提供免 DI 的便捷包装。
 */
import { getPool } from "@/lib/db/pool";
import { NoticeInteractionRepo } from "@/lib/repos/notices/notice-interaction.repo";
import { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeTranslationRepo } from "@/lib/repos/notices/notice-translation.repo";
import { NoticeFeedbackRepo } from "@/lib/repos/notices/notice-feedback.repo";
import { MembershipRepo } from "@/lib/repos/membership.repo";
import {
  submitInterest,
  executeUnlock,
  processFeedback,
  NoticeNotFoundError,
  QuotaExceededError,
} from "./notice-actions";
import { getNoticeTranslation } from "./translation/translation-flow";
import type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";
export type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";

// ── 浏览计数 ──

/** 记录公告浏览流水 */
export async function recordNoticeView(params: { userId: number; noticeId: number; ip: string }): Promise<void> {
  const repo = new NoticeInteractionRepo(getPool());
  return repo.insertView(params);
}

// ── 解锁列表 ──

/** 查询用户解锁的公告列表 */
export async function listUserUnlocks(userId: number): Promise<unknown[]> {
  const repo = new NoticeUnlockRepo(getPool());
  return repo.listNoticeUnlocks(userId);
}

// ── 意向提交（包装 submitInterest，消除路由侧 DI 构造） ──

/** 提交公告意向 */
export async function submitNoticeInterest(params: {
  userId: number; noticeId: number; interestType: "interested" | "subscribed"; note: string;
}): Promise<void> {
  const pool = getPool();
  return submitInterest(
    {
      detailRepo: new NoticeDetailRepo(pool),
      interactionRepo: new NoticeInteractionRepo(pool),
      dbPool: pool,
    },
    params,
  );
}

// ── 解锁公告（包装 executeUnlock，消除路由侧 DI 构造） ──

export { NoticeNotFoundError, QuotaExceededError };

/** 解锁公告（含定价查询） */
export async function unlockNotice(params: {
  userId: number; noticeId: number; unlockType: "free" | "single" | "subscription";
}): Promise<{ alreadyUnlocked: boolean; unlockType: string }> {
  const pool = getPool();

  let price = 0;
  if (params.unlockType === "single") {
    const membershipRepo = new MembershipRepo(pool);
    const plans = await membershipRepo.findActivePlans();
    const singlePlan = plans.find((p) => p.plan_type === "single");
    price = Number(singlePlan?.price || 0);
  }

  return executeUnlock(
    {
      detailRepo: new NoticeDetailRepo(pool),
      unlockRepo: new NoticeUnlockRepo(pool),
      dbPool: pool,
      membershipRepo: new MembershipRepo(pool),
    },
    { userId: params.userId, noticeId: params.noticeId, unlockType: params.unlockType, price },
  );
}

// ── 翻译获取（包装 getNoticeTranslation） ──

/** 获取公告翻译（含付费墙前置校验由路由负责） */
export async function fetchNoticeTranslation(noticeId: number, lang: string): Promise<unknown> {
  const pool = getPool();
  return getNoticeTranslation(
    { pool, detailRepo: new NoticeDetailRepo(pool), translationRepo: new NoticeTranslationRepo(pool) },
    noticeId,
    lang,
  );
}

// ── 推荐反馈（包装 processFeedback） ──

/** 处理推荐反馈 */
export async function submitNoticeFeedback(params: {
  userId: number; sessionId: string; items: RecoFeedbackItem[];
}): Promise<Record<string, unknown>> {
  const pool = getPool();
  return processFeedback(
    {
      detailRepo: new NoticeDetailRepo(pool),
      feedbackRepo: new NoticeFeedbackRepo(pool),
      dbPool: pool,
    },
    params,
  ) as unknown as Promise<Record<string, unknown>>;
}
