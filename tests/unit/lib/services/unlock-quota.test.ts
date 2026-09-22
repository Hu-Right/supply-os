/**
 * 解锁配额共享口径固化测试（unlock-quota）
 *
 * 该模块是公告解锁与商机解锁的唯一记账口径（自 executeUnlock P0-2 修复抽取）。
 * 固化以下语义，任何修改必须同步两条解锁链路与本测试：
 * 1. 有可用权益 → 直接返回权益行 id（不触碰订阅表）；
 * 2. 无权益 + subscription → 按套餐 unlock_quota 封顶，懒补建物化权益
 *    （quotaUsed 对齐流水数、sourceOrderNo=SUB-{userId}-{planCode}）；
 * 3. 流水已达配额 / 无订阅 / 配额非法 → PAID_QUOTA_REQUIRED；
 * 4. single 无权益 → 直接拒绝（不兼容订阅放行）；
 * 5. 消耗 UPDATE affectedRows=0（并发耗尽/升级替代）→ PAID_QUOTA_REQUIRED。
 */
import { describe, it, expect, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import type { MembershipRepo } from "@/lib/repos/membership.repo";
import type { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";
import {
  ensureConsumableEntitlement, consumeEntitlementQuota, UnlockQuotaError,
} from "@/lib/services/unlock-quota";

const conn = {} as PoolConnection;

function makeRepos(opts: {
  entitlement?: { id: number } | null;
  subscription?: { id: number; plan_code: string; started_at: Date; expires_at: Date | null; unlock_quota: number | null } | null;
  usedSince?: number;
  materializedId?: number;
  consumeAffected?: number;
}) {
  const membershipRepo = {
    findAndLockEntitlement: vi.fn(async () => opts.entitlement ?? null),
    findActiveSubscriptionForUpdate: vi.fn(async () => opts.subscription ?? null),
    insertEntitlementWithUsedInTransaction: vi.fn(async () => opts.materializedId ?? 88),
  } as unknown as MembershipRepo;
  const unlockRepo = {
    countSubscriptionUnlocksSince: vi.fn(async () => opts.usedSince ?? 0),
    consumeEntitlementInTransaction: vi.fn(async () => opts.consumeAffected ?? 1),
  } as unknown as NoticeUnlockRepo;
  return { membershipRepo, unlockRepo };
}

describe("ensureConsumableEntitlement", () => {
  it("有可用权益：返回权益 id，不查订阅表", async () => {
    const { membershipRepo, unlockRepo } = makeRepos({ entitlement: { id: 7 } });
    const id = await ensureConsumableEntitlement(
      conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "subscription" },
    );
    expect(id).toBe(7);
    expect(membershipRepo.findActiveSubscriptionForUpdate).not.toHaveBeenCalled();
  });

  it("无权益 + subscription：按配额封顶物化权益，quotaUsed 对齐流水数", async () => {
    const startedAt = new Date("2026-09-01T00:00:00Z");
    const { membershipRepo, unlockRepo } = makeRepos({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: startedAt, expires_at: null, unlock_quota: 10 },
      usedSince: 3,
    });
    const id = await ensureConsumableEntitlement(
      conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "subscription" },
    );
    expect(id).toBe(88);
    expect(membershipRepo.insertEntitlementWithUsedInTransaction).toHaveBeenCalledWith(conn, {
      userId: 101, sourceOrderNo: "SUB-101-vip_monthly", planCode: "vip_monthly",
      quotaTotal: 10, quotaUsed: 3, startedAt, expiresAt: null,
    });
  });

  it("无权益 + subscription：流水已达套餐配额 → PAID_QUOTA_REQUIRED，不物化", async () => {
    const { membershipRepo, unlockRepo } = makeRepos({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: new Date(), expires_at: null, unlock_quota: 10 },
      usedSince: 10,
    });
    await expect(ensureConsumableEntitlement(
      conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "subscription" },
    )).rejects.toThrow(UnlockQuotaError);
    expect(membershipRepo.insertEntitlementWithUsedInTransaction).not.toHaveBeenCalled();
  });

  it("无权益 + 无活跃订阅 → PAID_QUOTA_REQUIRED", async () => {
    const { membershipRepo, unlockRepo } = makeRepos({ entitlement: null, subscription: null });
    await expect(ensureConsumableEntitlement(
      conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "subscription" },
    )).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });

  it("订阅套餐配额非法（0/NaN）→ PAID_QUOTA_REQUIRED（不放行）", async () => {
    for (const quota of [0, null]) {
      const { membershipRepo, unlockRepo } = makeRepos({
        entitlement: null,
        subscription: { id: 5, plan_code: "weird", started_at: new Date(), expires_at: null, unlock_quota: quota },
      });
      await expect(ensureConsumableEntitlement(
        conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "subscription" },
      )).rejects.toThrow("PAID_QUOTA_REQUIRED");
    }
  });

  it("single 无权益 → PAID_QUOTA_REQUIRED（即使有订阅也不放行）", async () => {
    const { membershipRepo, unlockRepo } = makeRepos({
      entitlement: null,
      subscription: { id: 5, plan_code: "vip_monthly", started_at: new Date(), expires_at: null, unlock_quota: 10 },
    });
    await expect(ensureConsumableEntitlement(
      conn, { membershipRepo, unlockRepo }, { userId: 101, unlockType: "single" },
    )).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(membershipRepo.findActiveSubscriptionForUpdate).not.toHaveBeenCalled();
  });
});

describe("consumeEntitlementQuota", () => {
  it("affectedRows>0：正常消耗", async () => {
    const { unlockRepo } = makeRepos({ consumeAffected: 1 });
    await expect(consumeEntitlementQuota(conn, unlockRepo, 7)).resolves.toBeUndefined();
    expect(unlockRepo.consumeEntitlementInTransaction).toHaveBeenCalledWith(conn, 7);
  });

  it("affectedRows=0（并发耗尽/升级替代）→ PAID_QUOTA_REQUIRED", async () => {
    const { unlockRepo } = makeRepos({ consumeAffected: 0 });
    await expect(consumeEntitlementQuota(conn, unlockRepo, 7)).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });
});
