/**
 * server/payment/fulfillment.ts 测试
 * 验证支付履约逻辑：activatePaidOrder / fulfillMockPayment / activateSubscription
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { activatePaidOrder, fulfillMockPayment, activateSubscription } from "../../../server/payment/fulfillment";

function createMockPaymentsRepo(overrides: Record<string, any> = {}) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  return {
    getConnection: vi.fn().mockResolvedValue(conn),
    findOrderForUpdate: vi.fn().mockResolvedValue(null),
    markAsPaidInTransaction: vi.fn().mockResolvedValue(undefined),
    findPlanInTransaction: vi.fn().mockResolvedValue(null),
    hasEntitlementForOrder: vi.fn().mockResolvedValue(false),
    insertEntitlementInTransaction: vi.fn().mockResolvedValue(undefined),
    createSubscriptionInTransaction: vi.fn().mockResolvedValue(undefined),
    promoteToVipInTransaction: vi.fn().mockResolvedValue(undefined),
    findBestEntitlementForUpgradeInTransaction: vi.fn().mockResolvedValue(null),
    markEntitlementUpgradedInTransaction: vi.fn().mockResolvedValue(undefined),
    insertUpgradedEntitlementInTransaction: vi.fn().mockResolvedValue(undefined),
    findUpgradeableSubscriptionInTransaction: vi.fn().mockResolvedValue(null),
    updateSubscriptionPlanInTransaction: vi.fn().mockResolvedValue(undefined),
    findByOrderNo: vi.fn().mockResolvedValue(null),
    markAsMockPaidInTransaction: vi.fn().mockResolvedValue(undefined),
    upsertNoticeInterestInTransaction: vi.fn().mockResolvedValue(undefined),
    _conn: conn,
    ...overrides,
  };
}

function createMockMembershipRepo(overrides: Record<string, any> = {}) {
  return {
    findPlanByCodeForFulfillment: vi.fn().mockResolvedValue(null),
    findPlanByCode: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("activatePaidOrder", () => {
  it("订单不存在 → 正常返回（事务提交后 return）", async () => {
    const repo = createMockPaymentsRepo();
    await activatePaidOrder(repo, "ORD-NOT-EXIST");
    expect(repo._conn.beginTransaction).toHaveBeenCalled();
    expect(repo._conn.commit).toHaveBeenCalled();
    expect(repo._conn.release).toHaveBeenCalled();
  });

  it("订单已 paid → 幂等跳过", async () => {
    const repo = createMockPaymentsRepo({
      findOrderForUpdate: vi.fn().mockResolvedValue({ status: "paid", order_no: "ORD-1" }),
    });
    await activatePaidOrder(repo, "ORD-1");
    expect(repo.markAsPaidInTransaction).not.toHaveBeenCalled();
    expect(repo._conn.commit).toHaveBeenCalled();
  });

  it("单次解锁卡 → 创建 entitlement、不升 VIP", async () => {
    const repo = createMockPaymentsRepo({
      findOrderForUpdate: vi.fn().mockResolvedValue({
        status: "pending", order_no: "ORD-2", user_key: "user1", plan_code: "SINGLE", order_type: "single",
      }),
      findPlanInTransaction: vi.fn().mockResolvedValue({
        plan_type: "single", unlock_quota: 5, duration_days: 30,
      }),
    });
    await activatePaidOrder(repo, "ORD-2");
    expect(repo.markAsPaidInTransaction).toHaveBeenCalled();
    expect(repo.insertEntitlementInTransaction).toHaveBeenCalled();
    expect(repo.promoteToVipInTransaction).not.toHaveBeenCalled();
  });

  it("订阅计划 → 创建 entitlement + 订阅 + 升 VIP", async () => {
    const repo = createMockPaymentsRepo({
      findOrderForUpdate: vi.fn().mockResolvedValue({
        status: "pending", order_no: "ORD-3", user_key: "user2", plan_code: "PRO", order_type: "subscription",
      }),
      findPlanInTransaction: vi.fn().mockResolvedValue({
        plan_type: "subscription", unlock_quota: 10, duration_days: 365,
      }),
    });
    await activatePaidOrder(repo, "ORD-3");
    expect(repo.createSubscriptionInTransaction).toHaveBeenCalled();
    expect(repo.insertEntitlementInTransaction).toHaveBeenCalled();
    expect(repo.promoteToVipInTransaction).toHaveBeenCalled();
  });

  it("事务异常 → 回滚并抛出", async () => {
    const repo = createMockPaymentsRepo({
      findOrderForUpdate: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    await expect(activatePaidOrder(repo, "ORD-ERR")).rejects.toThrow("DB error");
    expect(repo._conn.rollback).toHaveBeenCalled();
    expect(repo._conn.release).toHaveBeenCalled();
  });
});

describe("fulfillMockPayment", () => {
  it("订单不存在 → 返回 { found: false }", async () => {
    const payments = createMockPaymentsRepo();
    const membership = createMockMembershipRepo();
    const result = await fulfillMockPayment(payments, membership, { orderNo: "ORD-X", rawNotify: "{}" });
    expect(result).toEqual({ found: false });
  });

  it("订单已 paid → 直接返回 { found: true }", async () => {
    const payments = createMockPaymentsRepo({
      findByOrderNo: vi.fn().mockResolvedValue({ status: "paid", order_no: "ORD-Y" }),
    });
    const membership = createMockMembershipRepo();
    const result = await fulfillMockPayment(payments, membership, { orderNo: "ORD-Y", rawNotify: "{}" });
    expect(result).toEqual({ found: true });
  });

  it("pending 单次卡 → 标记 mock paid + 创建 entitlement", async () => {
    const payments = createMockPaymentsRepo({
      findByOrderNo: vi.fn().mockResolvedValue({
        status: "pending", order_no: "ORD-Z", user_key: "u1", plan_code: "SINGLE",
        order_type: "single", notice_id: null,
      }),
    });
    const membership = createMockMembershipRepo();
    const result = await fulfillMockPayment(payments, membership, { orderNo: "ORD-Z", rawNotify: "{}" });
    expect(result).toEqual({ found: true });
    expect(payments.markAsMockPaidInTransaction).toHaveBeenCalled();
    expect(payments.insertEntitlementInTransaction).toHaveBeenCalled();
  });
});

describe("activateSubscription", () => {
  it("套餐不存在 → 返回 null", async () => {
    const repo = createMockPaymentsRepo();
    const membership = createMockMembershipRepo();
    const result = await activateSubscription(repo, membership, { userKey: "u1", planCode: "INVALID" });
    expect(result).toBeNull();
  });

  it("套餐存在 → 创建订阅 + 升 VIP + 返回摘要", async () => {
    const repo = createMockPaymentsRepo();
    const membership = createMockMembershipRepo({
      findPlanByCode: vi.fn().mockResolvedValue({ price: 99, duration_days: 30, unlock_quota: 5 }),
    });
    const result = await activateSubscription(repo, membership, { userKey: "u1", planCode: "PRO" });
    expect(result).toEqual({ planCode: "PRO", price: 99, quota: 5 });
    expect(repo.createSubscriptionInTransaction).toHaveBeenCalled();
    expect(repo.promoteToVipInTransaction).toHaveBeenCalled();
  });
});
