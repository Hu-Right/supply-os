/**
 * 解锁配额消费共享逻辑（付费解锁记账唯一口径）
 *
 * @module lib/services/unlock-quota
 * @description 公告解锁（notice-actions.executeUnlock）与商机解锁
 *              （opportunity-unlock.executeOpportunityUnlock）共享的配额
 *              判定/消耗逻辑，自 executeUnlock P0-2 修复口径抽取收敛。
 *              同一用户的订阅配额池对两类解锁对象是同一份配额——共享
 *              逻辑防止两路径语义分叉（历史上商机路径"有订阅即无限放行、
 *              从不扣减"曾构成资损风险）。
 *
 *              记账原则（勿擅改）：
 *              - 配额发放/消耗唯一权威源 = crm_user_entitlements.quota_used；
 *              - "有订阅无权益"历史缺口按套餐 unlock_quota 封顶，并懒补建
 *                物化权益（quota_used 对齐历史流水数）；
 *              - crm_opportunity_unlocks 流水仅作审计明细，不作为记账源。
 *              调用方须处于解锁事务内（FOR UPDATE 序列化同一用户并发）。
 */
import type { PoolConnection } from "mysql2/promise";
import type { MembershipRepo } from "../repos/membership.repo";
import type { NoticeUnlockRepo } from "../repos/notices/notice-unlock.repo";

/** 配额业务失败：code 与 /api/notices|[id]/unlock 错误码语义对齐 */
export class UnlockQuotaError extends Error {
  constructor(public code: "PAID_QUOTA_REQUIRED") {
    super(code);
    this.name = "UnlockQuotaError";
  }
}

/**
 * 事务内取可用权益行（FOR UPDATE）；无权益且为订阅解锁时按 P0-2 口径
 * 封顶并懒补建物化权益。
 * @returns 待消耗的权益行 id（必有值；不满足配额条件时抛 UnlockQuotaError）
 */
export async function ensureConsumableEntitlement(
  conn: PoolConnection,
  deps: { membershipRepo: MembershipRepo; unlockRepo: NoticeUnlockRepo },
  params: { userId: number; unlockType: "single" | "subscription" },
): Promise<number> {
  const { membershipRepo, unlockRepo } = deps;
  const { userId, unlockType } = params;

  // P1-7 安全修复：SELECT FOR UPDATE 防止并发配额超卖
  const ent = await membershipRepo.findAndLockEntitlement(conn, userId);
  if (ent) return Number(ent.id);

  if (unlockType === "subscription") {
    // 无权益但有活跃订阅（历史缺口数据）：懒补建权益后统一走权益消耗，
    // 使配额记账永远落在权益表 quota_used，流水仅作审计明细。
    const sub = await membershipRepo.findActiveSubscriptionForUpdate(conn, userId);
    if (!sub) throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
    const quota = Number(sub.unlock_quota ?? 0);
    if (!Number.isFinite(quota) || quota <= 0) {
      throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
    }
    const used = await unlockRepo.countSubscriptionUnlocksSince(conn, userId, sub.started_at);
    if (used >= quota) {
      throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
    }
    // 物化权益：quota_used 对齐当前流水数，随后由 consumeEntitlement 递增
    return membershipRepo.insertEntitlementWithUsedInTransaction(conn, {
      userId,
      sourceOrderNo: `SUB-${userId}-${sub.plan_code}`,
      planCode: sub.plan_code,
      quotaTotal: quota,
      quotaUsed: used,
      startedAt: sub.started_at,
      expiresAt: sub.expires_at,
    });
  }

  throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
}

/**
 * 条件 UPDATE 消耗一份配额，affectedRows 复核防并发超卖/并发升级替代。
 * @throws UnlockQuotaError 配额已被并发消耗或权益已被升级替代
 */
export async function consumeEntitlementQuota(
  conn: PoolConnection,
  unlockRepo: NoticeUnlockRepo,
  entitlementId: number,
): Promise<void> {
  const affected = await unlockRepo.consumeEntitlementInTransaction(conn, entitlementId);
  if (affected === 0) {
    throw new UnlockQuotaError("PAID_QUOTA_REQUIRED");
  }
}
