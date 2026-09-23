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
import { NoticeFavoriteRepo } from "@/lib/repos/notices/notice-favorite.repo";
import { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import { BenefitWriteRepo } from "@/lib/repos/benefit-write.repo";
import {
  submitInterest,
  executeUnlock,
  processFeedback,
  NoticeNotFoundError,
  QuotaExceededError,
} from "./notice-actions";
import { getNoticeTranslation } from "./translation/translation-flow";
import { normalizeUnspscCodes, persistUserInterestCodes } from "./unspsc/index";
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

// ── 收藏（用户私有书签，与意向/订阅的销售线索语义分离） ──

/** 收藏/取消收藏（toggle，返回切换后的状态） */
export async function toggleNoticeFavorite(params: {
  userId: number; noticeId: number;
}): Promise<{ favorited: boolean }> {
  const pool = getPool();
  const repo = new NoticeFavoriteRepo(pool);
  if (!(await repo.noticeExists(params.noticeId))) {
    throw new NoticeNotFoundError();
  }
  if (await repo.exists(params.userId, params.noticeId)) {
    await repo.remove(params.userId, params.noticeId);
    return { favorited: false };
  }
  await repo.insert(params.userId, params.noticeId);
  // 收藏写入兴趣码画像（feedback_favorite +0.8，白名单既有来源）：
  // 仅喂推荐画像，不写 crm_notice_interests（销售线索漏斗保持纯净）；
  // 取消收藏不衰减，与其他来源口径一致；反复 toggle 由单码 500 软上限兜底
  try {
    const notice = await new NoticeDetailRepo(pool).findById(params.noticeId);
    const snapshot = normalizeUnspscCodes(
      (notice as { unspsc_codes?: unknown[] } | null)?.unspsc_codes ?? [],
    );
    await persistUserInterestCodes(pool, params.userId, snapshot, "feedback_favorite", 0.8);
  } catch (e) {
    console.warn("[notice-service] favorite interest-code persist failed (non-critical):", e);
  }
  return { favorited: true };
}

/** 用户已收藏的公告 id 集合（列表卡片/详情按钮状态回显） */
export async function listNoticeFavoriteIds(userId: number): Promise<number[]> {
  return new NoticeFavoriteRepo(getPool()).listNoticeIds(userId);
}

/** 我的收藏分页列表 */
export async function listNoticeFavorites(params: {
  userId: number; limit: number; offset: number; lang?: string | null;
}): Promise<{ total: number; items: unknown[] }> {
  const { total, items } = await new NoticeFavoriteRepo(getPool()).listFavorites(
    params.userId, params.limit, params.offset, params.lang || null,
  );
  return { total, items };
}

// ── 解锁公告（包装 executeUnlock，消除路由侧 DI 构造） ──

export { NoticeNotFoundError, QuotaExceededError };

/** 解锁公告（含定价查询） */
export async function unlockNotice(params: {
  userId: number; noticeId: number; unlockType: "free" | "single" | "subscription";
}): Promise<{ alreadyUnlocked: boolean; unlockType: string }> {
  const pool = getPool();

  // 单价快照：一次性解锁卡已下架（旧 single_89 is_active=0），新目录无"一次性商品"形态，
  // 因此解锁流水的 price 恒为 0（额度消耗已改记 crm_benefit_quotas，不再以单价计量）。
  const price = 0;

  return executeUnlock(
    {
      detailRepo: new NoticeDetailRepo(pool),
      unlockRepo: new NoticeUnlockRepo(pool),
      dbPool: pool,
      quotaDeps: { catalog: new BenefitSystemRepo(pool), write: new BenefitWriteRepo() },
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
