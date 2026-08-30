/**
 * 商机解锁编排（审查报告 F10）
 *
 * 与公告解锁 executeUnlock（notice-actions.ts）同构：
 * 事务 + FOR UPDATE 权益行锁 + 条件 UPDATE 配额 + affectedRows 复核 +
 * uk_user_opportunity 唯一键 ER_DUP_ENTRY 幂等。
 * 此前路由实现从不消耗 quota_used（一次解锁卡可无限解锁）且免费额度
 * 检查在事务外存在 TOCTOU。
 *
 * @module lib/services/opportunity-unlock
 */
import type { Pool } from "mysql2/promise";
import type { OpportunitiesRepo } from "../repos/opportunities.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import { persistUserInterestCodes } from "./unspsc/interest";

export class OpportunityUnlockError extends Error {
  constructor(public code: "FREE_LIMIT_REACHED" | "PAID_QUOTA_REQUIRED") {
    super(code);
  }
}

export interface OpportunityUnlockDeps {
  dbPool: Pool;
  opportunitiesRepo: OpportunitiesRepo;
  membershipRepo: MembershipRepo;
}

export interface OpportunityUnlockParams {
  userKey: string;
  opportunityId: number;
  unlockType: "free" | "subscription" | "single";
  price: number;
  snapshotJson: string;
}

export async function executeOpportunityUnlock(
  deps: OpportunityUnlockDeps,
  params: OpportunityUnlockParams,
): Promise<{ alreadyUnlocked: boolean; unlockType: string }> {
  const { dbPool, opportunitiesRepo, membershipRepo } = deps;
  const { userKey, opportunityId, unlockType, price, snapshotJson } = params;

  // 快速路径：无锁预检，减少事务冲突
  if (await opportunitiesRepo.findExistingUnlock(userKey, opportunityId)) {
    return { alreadyUnlocked: true, unlockType };
  }

  const conn = await dbPool.getConnection();
  let consumedEntitlementId: number | null = null;
  try {
    await conn.beginTransaction();

    // 事务内复查（并发请求可能已通过快速路径）
    const [existingRows] = await conn.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND opportunity_id = ? LIMIT 1",
      [userKey, opportunityId],
    );
    if ((existingRows as unknown[]).length > 0) {
      await conn.commit();
      return { alreadyUnlocked: true, unlockType };
    }

    // 免费额度：事务内 COUNT，防并发超免费次数
    if (unlockType === "free") {
      const freeQuota = await membershipRepo.getFreeQuota();
      const [countRows] = await conn.query(
        "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
        [userKey],
      );
      if (Number((countRows as Array<{ total: number }>)[0]?.total || 0) >= freeQuota) {
        await conn.rollback();
        throw new OpportunityUnlockError("FREE_LIMIT_REACHED");
      }
    }

    // 付费解锁：FOR UPDATE 锁定权益行，防并发配额超卖
    if (unlockType === "subscription" || unlockType === "single") {
      const [entRows] = await conn.query(
        `SELECT id, plan_code, quota_total, quota_used
         FROM crm_user_entitlements
         WHERE user_key = ? AND status = 'active' AND is_upgraded = 0 AND quota_total > quota_used
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC LIMIT 1
         FOR UPDATE`,
        [userKey],
      );
      const ent = (entRows as Array<{ id: number }>)[0];
      if (ent) {
        consumedEntitlementId = Number(ent.id);
      } else if (unlockType === "subscription") {
        // 与公告解锁一致：subscription 兼容活跃订阅（有有效订阅即放行）
        const [subRows] = await conn.query(
          `SELECT id FROM crm_user_subscriptions
           WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
           LIMIT 1`,
          [userKey],
        );
        if ((subRows as unknown[]).length === 0) {
          await conn.rollback();
          throw new OpportunityUnlockError("PAID_QUOTA_REQUIRED");
        }
      } else {
        await conn.rollback();
        throw new OpportunityUnlockError("PAID_QUOTA_REQUIRED");
      }
    }

    // 插入解锁记录（uk_user_opportunity 唯一约束兜底）
    await conn.query(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, user_key, opportunity_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
      [userKey, userKey, opportunityId, unlockType, price, snapshotJson],
    );

    // 消耗配额：条件 UPDATE + affectedRows 复核（并发耗尽则回滚）
    if (consumedEntitlementId) {
      const [updateResult] = await conn.query(
        "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used",
        [consumedEntitlementId],
      );
      if ((updateResult as { affectedRows?: number }).affectedRows === 0) {
        await conn.rollback();
        throw new OpportunityUnlockError("PAID_QUOTA_REQUIRED");
      }
    }

    // 商机解锁计数（同事务，保证计数与解锁一致）
    await conn.query(
      "UPDATE crm_bid_opportunities SET unlock_count = COALESCE(unlock_count, 0) + 1 WHERE id = ?",
      [opportunityId],
    );

    await conn.commit();

    // 事务外：兴趣码（非关键路径）
    if (userKey !== "guest") {
      try {
        await persistUserInterestCodes(dbPool, userKey, JSON.parse(snapshotJson), "unlock_order", 2.5);
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
