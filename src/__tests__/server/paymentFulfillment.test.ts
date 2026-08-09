// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  BILLING_PLANS,
  activateSubscription,
  fulfillMockPayment,
  createLegacyOrder,
} from "../../../server/services/paymentFulfillment";

/** Create a mock PaymentsRepo with all methods stubbed */
function createMockPaymentsRepo(overrides: Record<string, any> = {}) {
  const mock: Record<string, any> = {
    findByOrderNo: vi.fn(),
    createSubscription: vi.fn().mockResolvedValue(undefined),
    promoteToVip: vi.fn().mockResolvedValue(undefined),
    markAsMockPaid: vi.fn().mockResolvedValue(undefined),
    insertEntitlement: vi.fn().mockResolvedValue(undefined),
    upsertNoticeInterest: vi.fn().mockResolvedValue(undefined),
    createOrder: vi.fn().mockResolvedValue(undefined),
  };
  // Apply overrides as resolved mock return values
  for (const [key, value] of Object.entries(overrides)) {
    if (mock[key]) {
      mock[key].mockResolvedValue(value);
    }
  }
  return mock as any;
}

/** Create a mock MembershipRepo */
function createMockMembershipRepo(overrides: Record<string, any> = {}) {
  const mock: Record<string, any> = {
    findPlanByCode: vi.fn(),
    findPlanByCodeForFulfillment: vi.fn(),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (mock[key]) {
      mock[key].mockResolvedValue(value);
    }
  }
  return mock as any;
}

// ─── BILLING_PLANS ─────────────────────────────────────────────────────────
describe("BILLING_PLANS", () => {
  it("defines single/trial_3/week_21/annual plans", () => {
    expect(BILLING_PLANS.single).toBeDefined();
    expect(BILLING_PLANS.trial_3).toBeDefined();
    expect(BILLING_PLANS.week_21).toBeDefined();
    expect(BILLING_PLANS.annual).toBeDefined();
  });

  it("annual plan has 365 days and 1095 quota", () => {
    expect(BILLING_PLANS.annual.days).toBe(365);
    expect(BILLING_PLANS.annual.quota).toBe(1095);
    expect(BILLING_PLANS.annual.price).toBe(5600);
  });

  it("single plan has null days (no expiry)", () => {
    expect(BILLING_PLANS.single.days).toBeNull();
    expect(BILLING_PLANS.single.quota).toBe(1);
  });
});

// ─── activateSubscription ──────────────────────────────────────────────────
describe("activateSubscription", () => {
  it("creates subscription and promotes to VIP", async () => {
    const payments = createMockPaymentsRepo();
    const result = await activateSubscription(payments, {
      userKey: "user@test.com",
      planCode: "annual",
    });
    expect(result.planCode).toBe("annual");
    expect(result.price).toBe(5600);
    expect(result.quota).toBe(1095);
    expect(payments.createSubscription).toHaveBeenCalledWith("user@test.com", "annual", 365);
    expect(payments.promoteToVip).toHaveBeenCalledWith("user@test.com");
  });

  it("falls back to single plan for unknown planCode", async () => {
    const payments = createMockPaymentsRepo();
    const result = await activateSubscription(payments, {
      userKey: "user@test.com",
      planCode: "nonexistent",
    });
    expect(result.planCode).toBe("nonexistent");
    expect(result.price).toBe(BILLING_PLANS.single.price);
    // single plan has null days
    expect(payments.createSubscription).toHaveBeenCalledWith("user@test.com", "nonexistent", null);
  });

  it("handles week_21 plan with 7 days", async () => {
    const payments = createMockPaymentsRepo();
    const result = await activateSubscription(payments, {
      userKey: "u@x.com",
      planCode: "week_21",
    });
    expect(result.quota).toBe(21);
    expect(payments.createSubscription).toHaveBeenCalledWith("u@x.com", "week_21", 7);
  });
});

// ─── fulfillMockPayment ────────────────────────────────────────────────────
describe("fulfillMockPayment", () => {
  it("returns found=false when order does not exist", async () => {
    const payments = createMockPaymentsRepo({ findByOrderNo: null });
    const membership = createMockMembershipRepo();
    const result = await fulfillMockPayment(payments, membership, {
      orderNo: "PAY-NONE",
      rawNotify: "{}",
    });
    expect(result.found).toBe(false);
  });

  it("skips fulfillment when order is already paid", async () => {
    const payments = createMockPaymentsRepo({
      findByOrderNo: { status: "paid", user_key: "u@x.com", plan_code: "annual" },
    });
    const membership = createMockMembershipRepo();
    const result = await fulfillMockPayment(payments, membership, {
      orderNo: "PAY-PAID",
      rawNotify: "{}",
    });
    expect(result.found).toBe(true);
    expect(payments.markAsMockPaid).not.toHaveBeenCalled();
    expect(payments.insertEntitlement).not.toHaveBeenCalled();
  });

  it("fulfills pending single-type order without subscription", async () => {
    const order = {
      status: "pending",
      user_key: "u@x.com",
      plan_code: "single",
      notice_id: null,
    };
    const plan = { unlock_quota: 1, duration_days: null, plan_type: "single" };
    const payments = createMockPaymentsRepo({ findByOrderNo: order });
    const membership = createMockMembershipRepo({ findPlanByCodeForFulfillment: plan });

    const result = await fulfillMockPayment(payments, membership, {
      orderNo: "PAY-SINGLE",
      rawNotify: '{"ok":true}',
    });
    expect(result.found).toBe(true);
    expect(payments.markAsMockPaid).toHaveBeenCalledWith("PAY-SINGLE", '{"ok":true}');
    expect(payments.insertEntitlement).toHaveBeenCalledWith({
      userKey: "u@x.com",
      orderNo: "PAY-SINGLE",
      planCode: "single",
      quotaTotal: 1,
      durationDays: null,
    });
    // single plan: no subscription/VIP
    expect(payments.createSubscription).not.toHaveBeenCalled();
    expect(payments.promoteToVip).not.toHaveBeenCalled();
  });

  it("fulfills pending annual order with subscription and VIP", async () => {
    const order = {
      status: "pending",
      user_key: "u@x.com",
      plan_code: "annual",
      notice_id: 42,
    };
    const plan = { unlock_quota: 1095, duration_days: 365, plan_type: "annual" };
    const payments = createMockPaymentsRepo({ findByOrderNo: order });
    const membership = createMockMembershipRepo({ findPlanByCodeForFulfillment: plan });

    const result = await fulfillMockPayment(payments, membership, {
      orderNo: "PAY-ANNUAL",
      rawNotify: "{}",
    });
    expect(result.found).toBe(true);
    expect(payments.insertEntitlement).toHaveBeenCalledWith({
      userKey: "u@x.com",
      orderNo: "PAY-ANNUAL",
      planCode: "annual",
      quotaTotal: 1095,
      durationDays: 365,
    });
    expect(payments.createSubscription).toHaveBeenCalledWith("u@x.com", "annual", 365);
    expect(payments.promoteToVip).toHaveBeenCalledWith("u@x.com");
    // notice_id bound → record interest
    expect(payments.upsertNoticeInterest).toHaveBeenCalledWith("u@x.com", 42);
  });

  it("uses default plan when findPlanByCodeForFulfillment returns null", async () => {
    const order = { status: "pending", user_key: "u@x.com", plan_code: "unknown", notice_id: null };
    const payments = createMockPaymentsRepo({ findByOrderNo: order });
    const membership = createMockMembershipRepo({ findPlanByCodeForFulfillment: null });

    await fulfillMockPayment(payments, membership, { orderNo: "PAY-X", rawNotify: "{}" });
    // Default fallback: quota=1, duration=null
    expect(payments.insertEntitlement).toHaveBeenCalledWith({
      userKey: "u@x.com",
      orderNo: "PAY-X",
      planCode: "unknown",
      quotaTotal: 1,
      durationDays: null,
    });
  });

  it("does not upsert interest when order has no notice_id", async () => {
    const order = { status: "pending", user_key: "u@x.com", plan_code: "single", notice_id: null };
    const plan = { unlock_quota: 1, duration_days: null, plan_type: "single" };
    const payments = createMockPaymentsRepo({ findByOrderNo: order });
    const membership = createMockMembershipRepo({ findPlanByCodeForFulfillment: plan });

    await fulfillMockPayment(payments, membership, { orderNo: "PAY-NO-NOTICE", rawNotify: "{}" });
    expect(payments.upsertNoticeInterest).not.toHaveBeenCalled();
  });
});

// ─── createLegacyOrder ─────────────────────────────────────────────────────
describe("createLegacyOrder", () => {
  it("returns null when plan is not found", async () => {
    const payments = createMockPaymentsRepo();
    const membership = createMockMembershipRepo({ findPlanByCode: null });

    const result = await createLegacyOrder(payments, membership, {
      userKey: "u@x.com",
      provider: "mock",
      planCode: "nonexistent",
      noticeId: null,
      orderNo: "ORD-1",
      payUrl: "http://pay",
      rawRequest: "{}",
    });
    expect(result).toBeNull();
    expect(payments.createOrder).not.toHaveBeenCalled();
  });

  it("creates a pending order and returns plan info", async () => {
    const plan = { name: "Annual Plan", price: 5600, currency: "CNY" };
    const payments = createMockPaymentsRepo();
    const membership = createMockMembershipRepo({ findPlanByCode: plan });

    const result = await createLegacyOrder(payments, membership, {
      userKey: "u@x.com",
      provider: "mock",
      planCode: "annual",
      noticeId: 42,
      orderNo: "ORD-1",
      payUrl: "http://pay",
      rawRequest: '{"test":true}',
    });
    expect(result).toEqual({ planName: "Annual Plan", amount: 5600, currency: "CNY" });
    expect(payments.createOrder).toHaveBeenCalledWith({
      userKey: "u@x.com",
      orderNo: "ORD-1",
      provider: "mock",
      planCode: "annual",
      noticeId: 42,
      amount: 5600,
      currency: "CNY",
      payUrl: "http://pay",
      qrCodeUrl: null,
      rawRequest: '{"test":true}',
    });
  });

  it("defaults currency to CNY when plan has no currency", async () => {
    const plan = { name: "Basic", price: 99, currency: undefined };
    const payments = createMockPaymentsRepo();
    const membership = createMockMembershipRepo({ findPlanByCode: plan });

    const result = await createLegacyOrder(payments, membership, {
      userKey: "u@x.com",
      provider: "mock",
      planCode: "trial_3",
      noticeId: null,
      orderNo: "ORD-2",
      payUrl: "http://pay",
      rawRequest: "{}",
    });
    expect(result!.currency).toBe("CNY");
  });

  it("passes noticeId=null for non-notice orders", async () => {
    const plan = { name: "Single", price: 89, currency: "CNY" };
    const payments = createMockPaymentsRepo();
    const membership = createMockMembershipRepo({ findPlanByCode: plan });

    await createLegacyOrder(payments, membership, {
      userKey: "u@x.com",
      provider: "mock",
      planCode: "single",
      noticeId: null,
      orderNo: "ORD-3",
      payUrl: null,
      rawRequest: "{}",
    });
    expect(payments.createOrder.mock.calls[0][0].noticeId).toBeNull();
  });
});
