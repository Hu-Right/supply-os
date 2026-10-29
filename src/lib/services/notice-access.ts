/**
 * 公告访问判定（会员权益 + 单条解锁）
 *
 * 历史模型以 opportunity_unlocks 的单条记录作为访问凭证；无限次会员虽然
 * 权益上可看全部，前端/接口仍被迫补一条“解锁”记录。这里把两件事统一：
 *  - 有单条解锁记录：可访问
 *  - 套餐 notice_view 已包含（非免费档）：可访问，无需再落解锁记录
 *
 * 免费档仍走单条解锁/配额，不在此放开。
 */
import type { RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { NoticeUnlockRepo } from "../repos/notices/notice-unlock.repo";
import { NOTICE_VIEW_BENEFIT } from "./benefit-matrix";

export interface NoticeAccess {
  unlock: RowDataPacket | null;
  /** 套餐本身已包含无限/不限公告查看，不依赖单条解锁记录 */
  accessibleByPlan: boolean;
}

export async function resolveNoticeAccess(params: {
  userId: number;
  noticeId: number;
  unlockRepo: NoticeUnlockRepo;
  benefitRepo: BenefitSystemRepo;
}): Promise<NoticeAccess> {
  const { userId, noticeId, unlockRepo, benefitRepo } = params;
  const unlock = await unlockRepo.findUnlock(userId, noticeId);
  if (unlock) return { unlock, accessibleByPlan: true };

  const plan = await benefitRepo.findActivePlanForUser(userId);
  if (!plan || plan.plan_code === "free") return { unlock: null, accessibleByPlan: false };

  const entitled = await benefitRepo.isEntitled(userId, NOTICE_VIEW_BENEFIT);
  return { unlock: null, accessibleByPlan: entitled };
}
