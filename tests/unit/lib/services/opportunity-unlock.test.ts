/**
 * 商机解锁编排全分支测试（架构评估 P0-T1：executeOpportunityUnlock）
 * 已适配 userId 契约（identity 重构 2026-09-03）
 *
 * 与公告解锁 executeUnlock 同构的事务编排（审查 F10）：
 * - 快速路径/事务内复查幂等（唯一键 + ER_DUP_ENTRY）
 * - 免费试用移除后的服务端硬闸（free 一律 FREE_LIMIT_REACHED）
 * - FOR UPDATE 权益行锁 + 条件 UPDATE 配额 + affectedRows 复核（防超卖）
 * - subscription 兼容活跃订阅放行；single 无权益拒绝
 * - 商机计数与解锁同事务；兴趣码为非关键路径（userId=0 不写）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { OpportunitiesRepo } from "@/lib/repos/opportunities.repo";
import type { MembershipRepo } from "@/lib/repos/membership.repo";
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
  hasActiveSubscription?: boolean;
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
      if (sql.includes("FROM crm_user_entitlements") && sql.includes("FOR UPDATE")) {
        return [opts.entitlement ? [opts.entitlement] : []];
      }
      if (sql.includes("FROM crm_user_subscriptions")) {
        return [opts.hasActiveSubscription ? [{ id: 1 }] : []];
      }
      if (sql.includes("INSERT INTO crm_opportunity_unlocks")) {
        if (opts.insertError) throw opts.insertError;
        return [{}];
      }
      if (sql.includes("UPDATE crm_user_entitlements SET quota_used")) {
        return [{ affectedRows: opts.quotaUpdateAffected ?? 1 }];
      }
      if (sql.includes("UPDATE crm_bid_opportunities SET unlock_count")) {
        return [{}];
      }
      return [[]];
    }) as QueryFn,
  } as unknown as PoolConnection & { query: QueryFn; commit: ReturnType<typeof vi.fn>; rollback: ReturnType<typeof vi.fn> };
  const dbPool = { getConnection: vi.fn(async () => conn) } as unknown as Pool;
  const opportunitiesRepo = {
    findExistingUnlock: vi.fn().mockResolvedValue(opts.fastPathHit ?? false),
  } as unknown as OpportunitiesRepo;
  const deps: OpportunityUnlockDeps = {
    dbPool,
    opportunitiesRepo,
    membershipRepo: {} as MembershipRepo,
  };
  const params = {
    userId: 101,
    opportunityId: 42,
    unlockType: "single" as "free" | "subscription" | "single",
    price: 99,
    snapshotJson: '{"codes":["123456"]}',
  };
  return { deps, params, conn, opportunitiesRepo };
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

describe("executeOpportunityUnlock 付费解锁配额", () => {
  it("single 持有可用权益：插入解锁 + 配额 +1 + 计数 +1 同事务提交", async () => {
    const { deps, params, conn } = makeEnv({ entitlement: { id: 7 } });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result).toEqual({ alreadyUnlocked: false, unlockType: "single" });
    const insertCall = conn.query.mock.calls.find(([sql]: string[]) => sql.includes("INSERT INTO crm_opportunity_unlocks"));
    expect(insertCall).toBeTruthy();
    // userId 直存（identity 重构后无子查询反查）
    expect(insertCall![1]).toEqual([101, 42, "single", 99, '{"codes":["123456"]}']);
    const quotaCall = conn.query.mock.calls.find(([sql]: string[]) => sql.includes("SET quota_used = quota_used + 1"));
    expect(quotaCall![1]).toEqual([7]);
    expect(conn.commit).toHaveBeenCalled();
    // 非关键路径：兴趣码事务外异步写入
    expect(persistUserInterestCodes).toHaveBeenCalled();
  });

  it("subscription 无权益行但有活跃订阅 → 放行且不消耗配额", async () => {
    const { deps, conn } = makeEnv({ entitlement: null, hasActiveSubscription: true });
    const result = await executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    expect(result.alreadyUnlocked).toBe(false);
    const quotaCall = conn.query.mock.calls.find(([sql]: string[]) => sql.includes("SET quota_used = quota_used + 1"));
    expect(quotaCall).toBeUndefined();
    expect(conn.commit).toHaveBeenCalled();
  });

  it("subscription 无权益且无活跃订阅 → PAID_QUOTA_REQUIRED 回滚", async () => {
    const { deps, conn } = makeEnv({ entitlement: null, hasActiveSubscription: false });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("single 无任何权益 → PAID_QUOTA_REQUIRED（不兼容订阅放行）", async () => {
    const { deps } = makeEnv({ entitlement: null, hasActiveSubscription: true });
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
