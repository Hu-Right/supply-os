/**
 * 商机解锁编排（审查报告 F10 + 配额口径对齐 2026-09-19）
 *
 * 与公告解锁 executeUnlock（notice-actions.ts）共享 unlock-quota 唯一记账口径：
 * 事务 + FOR UPDATE 权益行锁 + 无权益纯订阅按套餐配额封顶并懒补建物化权益 +
 * 条件 UPDATE 配额 + affectedRows 复核 + uk_user_opportunity 唯一键 ER_DUP_ENTRY 幂等。
 * 历史两次分叉：① 早期路由实现从不消耗 quota_used（一次解锁卡可无限解锁）且
 * 免费额度检查在事务外存在 TOCTOU（F10 修复）；② F10 版本对"有订阅无权益"
 * 仍保留"有活跃订阅即放行、不扣任何配额"的无限放行漏洞（本次修复：对齐公告
 * 路径的封顶+物化权益语义，订阅配额池对公告/商机是同一份，不得路径分叉）。
 *
 * @module lib/services/opportunity-unlock
 */
import type { Pool } from "mysql2/promise";
import type { OpportunitiesRepo } from "../repos/opportunities.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import type { NoticeUnlockRepo } from "../repos/notices/notice-unlock.repo";
import { ensureConsumableEntitlement, consumeEntitlementQuota, UnlockQuotaError } from "./unlock-quota";
import { persistUserInterestCodes } from "./unspsc/interest";

/** 解锁业务失败：code 供路由映射为用户可见文案（FREE_LIMIT_REACHED/PAID_QUOTA_REQUIRED） */
export class OpportunityUnlockError extends Error {
  constructor(public code: "FREE_LIMIT_REACHED" | "PAID_QUOTA_REQUIRED") {
    super(code);
  }
}

export interface OpportunityUnlockDeps {
  dbPool: Pool;
  opportunitiesRepo: OpportunitiesRepo;
  membershipRepo: MembershipRepo;
  /** 解锁流水/配额消费 repo（共享 unlock-quota 口径的承载体） */
  unlockRepo: NoticeUnlockRepo;
}

export interface OpportunityUnlockParams {
  /** 内部用户 ID */
  userId: number;
  opportunityId: number;
  unlockType: "free" | "subscription" | "single";
  price: number;
  snapshotJson: string;
}

/**
 * 执行商机解锁（事务编排，与公告解锁 executeUnlock 同构）。
 *
 * 流程：无锁预检幂等 → 事务（复查幂等 → free 硬闸 → 共享配额口径取权益行
 * （FOR UPDATE，含无权益纯订阅的封顶+物化）→ 插入解锁记录（唯一键
 * ER_DUP_ENTRY 兜底幂等）→ 条件 UPDATE 消耗配额 + affectedRows 复核防超卖 →
 * 商机计数+1）→ 提交 → 事务外写兴趣码（非关键路径，userId=0 跳过）。
 *
 * @throws OpportunityUnlockError FREE_LIMIT_REACHED（免费解锁已移除，服务端硬闸）
 *         | PAID_QUOTA_REQUIRED（无可用权益且无满足配额的订阅 / 并发配额耗尽）
 * @returns alreadyUnlocked=true 表示并发请求已完成解锁（幂等成功语义）
 */
export async function executeOpportunityUnlock(
  deps: OpportunityUnlockDeps,
  params: OpportunityUnlockParams,
): Promise<{ alreadyUnlocked: boolean; unlockType: string }> {
  const { dbPool, opportunitiesRepo, membershipRepo, unlockRepo } = deps;
  const { userId, opportunityId, unlockType, price, snapshotJson } = params;

  // 快速路径：无锁预检，减少事务冲突
  if (await opportunitiesRepo.findExistingUnlock(userId, opportunityId)) {
    return { alreadyUnlocked: true, unlockType };
  }

  const conn = await dbPool.getConnection();
  let consumedEntitlementId: number | null = null;
  try {
    await conn.beginTransaction();

    // 事务内复查（并发请求可能已通过快速路径）
    const [existingRows] = await conn.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_id = ? AND opportunity_id = ? LIMIT 1",
      [userId, opportunityId],
    );
    if ((existingRows as unknown[]).length > 0) {
      await conn.commit();
      return { alreadyUnlocked: true, unlockType };
    }

    // 免费试用已移除（2026-08-30 产品决策）：服务端硬闸，free 解锁一律 402，
    // 与公告解锁 executeUnlock 口径一致；历史 free 记录保留可审计
    if (unlockType === "free") {
      await conn.rollback();
      throw new OpportunityUnlockError("FREE_LIMIT_REACHED");
    }

    // 付费解锁：共享公告路径的配额记账口径（FOR UPDATE 权益行锁；无权益纯订阅
    // 按套餐配额封顶并懒补建物化权益），杜绝"有订阅即无限放行"的路径分叉
    if (unlockType === "subscription" || unlockType === "single") {
      try {
        consumedEntitlementId = await ensureConsumableEntitlement(
          conn, { membershipRepo, unlockRepo }, { userId, unlockType },
        );
      } catch (quotaErr) {
        if (quotaErr instanceof UnlockQuotaError) {
          await conn.rollback();
          throw new OpportunityUnlockError("PAID_QUOTA_REQUIRED");
        }
        throw quotaErr;
      }
    }

    // 插入解锁记录（uk_user_opportunity 唯一约束兆底）
    await conn.query(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, opportunity_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [userId, opportunityId, unlockType, price, snapshotJson],
    );

    // 消耗配额：条件 UPDATE + affectedRows 复核（并发耗尽/并发升级替代则回滚）
    if (consumedEntitlementId) {
      try {
        await consumeEntitlementQuota(conn, unlockRepo, consumedEntitlementId);
      } catch (consumeErr) {
        if (consumeErr instanceof UnlockQuotaError) {
          await conn.rollback();
          throw new OpportunityUnlockError("PAID_QUOTA_REQUIRED");
        }
        throw consumeErr;
      }
    }

    // 商机解锁计数（同事务，保证计数与解锁一致）
    await conn.query(
      "UPDATE crm_bid_opportunities SET unlock_count = COALESCE(unlock_count, 0) + 1 WHERE id = ?",
      [opportunityId],
    );

    await conn.commit();

    // 事务外：兴趣码（非关键路径）
    if (userId) {
      try {
        await persistUserInterestCodes(dbPool, userId, JSON.parse(snapshotJson), "unlock_order", 2.5);
      } catch { /* 忽略 */ }
    }
    return { alreadyUnlocked: false, unlockType };
  } catch (err) {
    await conn.rollback();
    // 唯一约束冲突 = 并发请求已解锁
    if ((err as { code?: string })?.code === "ER_DUP_ENTRY") {
      return { alreadyUnlocked: true, unlockType };
    }
    throw err;
  } finally {
    conn.release();
  }
}
