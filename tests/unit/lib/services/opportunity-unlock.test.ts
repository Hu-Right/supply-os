/**
 * 商机解锁编排全分支测试（架构评估 P0-T1 + 配额口径对齐 2026-09-19）
 * 已适配 userId 契约（identity 重构 2026-09-03）
 *
 * 与公告解锁 executeUnlock 共享 unlock-quota 唯一记账口径：
 * - 快速路径/事务内复查幂等（唯一键 + ER_DUP_ENTRY）
 * - 免费试用移除后的服务端硬闸（free 一律 FREE_LIMIT_REACHED）
 * - FOR UPDATE 权益行锁 + 条件 UPDATE 配额 + affectedRows 复核（防超卖）
 * - 无权益纯订阅：按套餐配额封顶并懒补建物化权益（不再"有订阅即无限放行"）
 * - single 无权益拒绝；商机计数与解锁同事务；兴趣码非关键路径（userId=0 不写）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { OpportunitiesRepo } from "@/lib/repos/opportunities.repo";
import type { MembershipRepo } from "@/lib/repos/membership.repo";
import type { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";
import type { OpportunityUnlockDeps } from "@/lib/services/opportunity-unlock";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/unspsc/interest", () => ({ persistUserInterestCodes: vi.fn().mockResolvedValue(undefined) }));

import { persistUserInterestCodes } from "@/lib/services/unspsc/interest";
import { executeOpportunityUnlock, OpportunityUnlockError } from "@/lib/services/opportunity-unlock";

type QueryFn = ReturnType<typeof vi.fn>;

function makeEnv(opts: {
  fastPathHit?: boolean;
  inTxnAlreadyUnlocked?: boolean;
  entitlement?: { id: number } | null;
  /** 无权益纯订阅路径的活跃订阅（含套餐配额）；null 表示无订阅 */
  subscription?: { id: number; plan_code: string; started_at: Date; expires_at: Date | null; unlock_quota: number | null } | null;
  /** 订阅周期内已产生的 subscription 类型解锁流水数 */
  subscriptionUnlocksSince?: number;
  materializedEntitlementId?: number;
  quotaUpdateAffected?: number;
  insertError?: { code: string };
}) {
  const conn = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM crm_opportunity_unlocks WHERE")) {
        return [opts.inTxnAlreadyUnlocked ? [{ id: 1 }] : []];
      }
      if (sql.includes("INSERT INTO crm_opportunity_unlocks")) {
        if (opts.insertError) throw opts.insertError;
        return [{}];
      }
      if (sql.includes("UPDATE crm_bid_opportunities SET unlock_count")) {
        return [{}];
      }
      return [[]];
    }) as QueryFn,
  } as unknown as PoolConnection & {
    query: QueryFn; commit: ReturnType<typeof vi.fn>; rollback: ReturnType<typeof vi.fn>;
  };
  const dbPool = { getConnection: vi.fn(async () => conn) } as unknown as Pool;
  const opportunitiesRepo = {
    findExistingUnlock: vi.fn().mockResolvedValue(opts.fastPathHit ?? false),
  } as unknown as OpportunitiesRepo;
  const membershipRepo = {
    findAndLockEntitlement: vi.fn(async () => opts.entitlement ?? null),
    findActiveSubscriptionForUpdate: vi.fn(async () =>
      opts.subscription === undefined ? null : opts.subscription),
    insertEntitlementWithUsedInTransaction: vi.fn(async () => opts.materializedEntitlementId ?? 88),
  } as unknown as MembershipRepo;
  const unlockRepo = {
    countSubscriptionUnlocksSince: vi.fn(async () => opts.subscriptionUnlocksSince ?? 0),
    consumeEntitlementInTransaction: vi.fn(async () => opts.quotaUpdateAffected ?? 1),
  } as unknown as NoticeUnlockRepo;
  const deps: OpportunityUnlockDeps = {
    dbPool, opportunitiesRepo, membershipRepo, unlockRepo,
  };
  const params = {
    userId: 101,
    opportunityId: 42,
    unlockType: "single" as "free" | "subscription" | "single",
    price: 99,
    snapshotJson: '{"codes":["123456"]}',
  };
  return { deps, params, conn, opportunitiesRepo, membershipRepo, unlockRepo };
}

beforeEach(() => vi.clearAllMocks());

describe("executeOpportunityUnlock 幂等", () => {
  it("快速路径命中：alreadyUnlocked=true，不开事务", async () => {
    const { deps, params, conn } = makeEnv({ fastPathHit: true });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result).toEqual({ alreadyUnlocked: true, unlockType: "single" });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it("事务内复查命中：提交并返回 alreadyUnlocked（并发已解锁）", async () => {
    const { deps, params, conn } = makeEnv({ inTxnAlreadyUnlocked: true });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result.alreadyUnlocked).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it("插入撞唯一键 ER_DUP_ENTRY → 幂等返回 alreadyUnlocked", async () => {
    const { deps, params, conn } = makeEnv({ entitlement: { id: 7 }, insertError: { code: "ER_DUP_ENTRY" } });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result.alreadyUnlocked).toBe(true);
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe("executeOpportunityUnlock 免费硬闸（2026-08-30 产品决策）", () => {
  it("free 解锁一律 FREE_LIMIT_REACHED，不写解锁记录", async () => {
    const { deps, conn } = makeEnv({});
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "free", price: 0, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow(OpportunityUnlockError);
    await expect(result).rejects.toThrow("FREE_LIMIT_REACHED");
    expect(conn.rollback).toHaveBeenCalled();
    expect(persistUserInterestCodes).not.toHaveBeenCalled();
  });
});

describe("executeOpportunityUnlock 付费解锁配额（共享 unlock-quota 口径）", () => {
  it("single 持有可用权益：插入解锁 + 配额 +1 + 计数 +1 同事务提交", async () => {
    const { deps, params, conn, unlockRepo } = makeEnv({ entitlement: { id: 7 } });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result).toEqual({ alreadyUnlocked: false, unlockType: "single" });
    const insertCall = conn.query.mock.calls.find(([sql]: string[]) => sql.includes("INSERT INTO crm_opportunity_unlocks"));
    expect(insertCall).toBeTruthy();
    // userId 直存（identity 重构后无子查询反查）
    expect(insertCall![1]).toEqual([101, 42, "single", 99, '{"codes":["123456"]}']);
    expect(unlockRepo.consumeEntitlementInTransaction).toHaveBeenCalledWith(expect.anything(), 7);
    expect(conn.commit).toHaveBeenCalled();
    // 非关键路径：兴趣码事务外异步写入
    expect(persistUserInterestCodes).toHaveBeenCalled();
  });

  it("subscription 无权益行但有满足配额的活跃订阅 → 懒补建物化权益并消耗", async () => {
    const startedAt = new Date("2026-09-01T00:00:00Z");
    const { deps, conn, membershipRepo, unlockRepo } = makeEnv({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: startedAt, expires_at: null, unlock_quota: 10 },
      subscriptionUnlocksSince: 3,
    });
    const result = await executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    expect(result.alreadyUnlocked).toBe(false);
    // 物化权益：quota_used 对齐流水数（3），随后按物化行 id 消耗
    const insertEnt = membershipRepo.insertEntitlementWithUsedInTransaction as ReturnType<typeof vi.fn>;
    expect(insertEnt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: 101, planCode: "vip_monthly", quotaTotal: 10, quotaUsed: 3,
      sourceOrderNo: "SUB-101-vip_monthly",
    }));
    expect(unlockRepo.consumeEntitlementInTransaction).toHaveBeenCalledWith(expect.anything(), 88);
    expect(conn.commit).toHaveBeenCalled();
  });

  it("subscription 无权益且流水已达套餐配额 → PAID_QUOTA_REQUIRED 回滚（不再无限放行）", async () => {
    const { deps, conn, membershipRepo, unlockRepo } = makeEnv({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: new Date(), expires_at: null, unlock_quota: 10 },
      subscriptionUnlocksSince: 10,
    });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(membershipRepo.insertEntitlementWithUsedInTransaction).not.toHaveBeenCalled();
    expect(unlockRepo.consumeEntitlementInTransaction).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("subscription 无权益且无活跃订阅 → PAID_QUOTA_REQUIRED 回滚", async () => {
    const { deps, conn } = makeEnv({ entitlement: null, subscription: null });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("single 无任何权益 → PAID_QUOTA_REQUIRED（不兼容订阅放行）", async () => {
    const { deps } = makeEnv({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: new Date(), expires_at: null, unlock_quota: 10 },
    });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "single", price: 99, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });

  it("配额条件 UPDATE affectedRows=0（并发耗尽）→ 回滚抛 PAID_QUOTA_REQUIRED", async () => {
    const { deps, conn } = makeEnv({ entitlement: { id: 7 }, quotaUpdateAffected: 0 });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "single", price: 99, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("userId=0（未认证）不写兴趣码", async () => {
    const { deps } = makeEnv({ entitlement: { id: 7 } });
    await executeOpportunityUnlock(deps, {
      userId: 0, opportunityId: 42, unlockType: "single", price: 99, snapshotJson: '{"codes":[]}',
    });
    expect(persistUserInterestCodes).not.toHaveBeenCalled();
  });
});
