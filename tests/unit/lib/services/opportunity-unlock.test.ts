/**
 * 商机解锁编排全分支测试（架构评估 P0-T1 + 配额口径对齐 2026-09-19）
 * 已适配 userId 契约（identity 重构 2026-09-03）
 *
 * 与公告解锁 executeUnlock 共享 unlock-quota 唯一记账口径（权益体系新账本）：
 * - 快速路径/事务内复查幂等（唯一键 + ER_DUP_ENTRY）
 * - 免费试用移除后的服务端硬闸（free 一律 FREE_LIMIT_REACHED）
 * - FOR UPDATE 锁住 notice_view 池行 + 条件 UPDATE 扣减 + affectedRows 复核（防超卖）
 * - 无额度（未订阅且 free 档零额度 / 矩阵缺格）→ PAID_QUOTA_REQUIRED 且**不留下解锁流水**
 * - single 无任何额度同样拒绝；商机计数与解锁同事务；兴趣码非关键路径（userId=0 不写）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { OpportunitiesRepo } from "@/lib/repos/opportunities.repo";
import type { ActivePlanRow, BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { BenefitWriteRepo, LockedPoolRow } from "@/lib/repos/benefit-write.repo";
import type { OpportunityUnlockDeps } from "@/lib/services/opportunity-unlock";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/unspsc/interest", () => ({ persistUserInterestCodes: vi.fn().mockResolvedValue(undefined) }));

import { persistUserInterestCodes } from "@/lib/services/unspsc/interest";
import { executeOpportunityUnlock, OpportunityUnlockError } from "@/lib/services/opportunity-unlock";

type QueryFn = ReturnType<typeof vi.fn>;

function makeEnv(opts: {
  fastPathHit?: boolean;
  inTxnAlreadyUnlocked?: boolean;
  /** 用户生效订阅（null=未订阅，按 free 档判额度） */
  active?: ActivePlanRow | null;
  /** 矩阵 notice_view 格 */
  matrixCells?: Array<{ benefit_code: string; value_num: number | null }>;
  /** 锁池返回（null=无池） */
  pool?: LockedPoolRow | null;
  consume?: "consumed" | "denied" | "unlimited";
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
  const quotaDeps = {
    catalog: {
      findActivePlanForUser: vi.fn(async () => opts.active ?? null),
      loadCells: vi.fn(async () => opts.matrixCells ?? [{ benefit_code: "notice_view", value_num: 10 }]),
    } as unknown as BenefitSystemRepo,
    write: {
      findAndLockCurrentPool: vi.fn(async () => opts.pool ?? null),
      openQuotaPool: vi.fn(async () => undefined),
      consumeLockedPool: vi.fn(async () => opts.consume ?? "consumed"),
    } as unknown as BenefitWriteRepo,
  };
  const deps: OpportunityUnlockDeps = {
    dbPool, opportunitiesRepo, quotaDeps,
  };
  const params = {
    userId: 101,
    opportunityId: 42,
    unlockType: "single" as "free" | "subscription" | "single",
    price: 99,
    snapshotJson: '{"codes":["123456"]}',
  };
  return { deps, params, conn, opportunitiesRepo, quotaDeps };
}

const ACTIVE = { subscription_id: 55, owner_user_id: 101, plan_code: "starter" } as unknown as ActivePlanRow;
const POOL = {
  id: 900, subscription_id: 55, seat_user_id: 101, benefit_code: "notice_view",
  quota_total: 10, quota_used: 0, status: "active",
} as unknown as LockedPoolRow;
const params0 = () => ({ userId: 101, opportunityId: 42, unlockType: "single" as const, price: 99, snapshotJson: "{}" });

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
    const { deps, params, conn } = makeEnv({ pool: POOL, insertError: { code: "ER_DUP_ENTRY" } });
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
  it("已订阅且有池：插入解锁 + 扣池一次 + 计数 +1 同事务提交", async () => {
    const { deps, params, conn, quotaDeps } = makeEnv({ active: ACTIVE, pool: POOL });
    const result = await executeOpportunityUnlock(deps, params);
    expect(result).toEqual({ alreadyUnlocked: false, unlockType: "single" });
    const insertCall = conn.query.mock.calls.find(([sql]: string[]) => sql.includes("INSERT INTO crm_opportunity_unlocks"));
    expect(insertCall).toBeTruthy();
    // userId 直存（identity 重构后无子查询反查）
    expect(insertCall![1]).toEqual([101, 42, "single", 99, '{"codes":["123456"]}']);
    // 扣的是刚锁到的那行池，而不是按用户 id 发一条 UPDATE
    expect(quotaDeps.write.consumeLockedPool).toHaveBeenCalledWith(expect.anything(), POOL);
    expect(conn.commit).toHaveBeenCalled();
    // 非关键路径：兴趣码事务外异步写入
    expect(persistUserInterestCodes).toHaveBeenCalled();
  });

  it("未订阅且 free 档零额度：PAID_QUOTA_REQUIRED 回滚，**不留下解锁流水**", async () => {
    const { deps, conn, quotaDeps } = makeEnv({
      active: null,
      matrixCells: [{ benefit_code: "notice_view", value_num: 0 }],
    });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "subscription", price: 0, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(conn.query.mock.calls.some(([sql]: string[]) => String(sql).includes("INSERT INTO crm_opportunity_unlocks"))).toBe(false);
    expect(quotaDeps.write.consumeLockedPool).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("池被并发扣尽（consume 返回 denied）→ 回滚抛 PAID_QUOTA_REQUIRED，计不进入", async () => {
    const { deps, conn, quotaDeps } = makeEnv({ active: ACTIVE, pool: POOL, consume: "denied" });
    const result = executeOpportunityUnlock(deps, {
      userId: 101, opportunityId: 42, unlockType: "single", price: 99, snapshotJson: "{}",
    });
    await expect(result).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(quotaDeps.write.consumeLockedPool).toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    // 计数与解锁同事务：回滚后不得留下 unlock_count 自增
    expect(conn.query.mock.calls.some(([sql]: string[]) => String(sql).includes("SET unlock_count"))).toBe(false);
  });

  it("不限档（-1 池）：consume 返回 unlimited 视为成功，仍提交", async () => {
    const { deps, conn } = makeEnv({
      active: ACTIVE,
      pool: { ...POOL, quota_total: -1 },
      consume: "unlimited",
    });
    await expect(executeOpportunityUnlock(deps, params0())).resolves.toEqual({ alreadyUnlocked: false, unlockType: "single" });
    expect(conn.commit).toHaveBeenCalled();
  });

  it("userId=0（未认证）不写兴趣码", async () => {
    const { deps } = makeEnv({ active: ACTIVE, pool: POOL });
    await executeOpportunityUnlock(deps, {
      userId: 0, opportunityId: 42, unlockType: "single", price: 99, snapshotJson: '{"codes":[]}',
    });
    expect(persistUserInterestCodes).not.toHaveBeenCalled();
  });
});
