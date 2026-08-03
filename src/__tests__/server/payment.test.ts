// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockProvider } from "../../../server/payment/MockProvider";
import { PaymentService } from "../../../server/payment/PaymentService";

/** mock mysql2 pool：query 按顺序返回 [rows]，execute 记录调用 */
function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([rows]);
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

/** 可控的支付策略假实现 */
function makeStrategy(overrides: Record<string, any> = {}) {
  return {
    name: "mock",
    createPaymentUrl: vi
      .fn()
      .mockImplementation(async (orderNo: string) => ({
        pay_url: `https://pay.example/${orderNo}`,
        qr_code_url: undefined,
      })),
    verifyCallback: vi.fn(),
    queryOrderStatus: vi.fn(),
    ...overrides,
  };
}

const annualPlan = {
  plan_code: "annual",
  name: "年度会员",
  price: 5600,
  currency: "CNY",
  unlock_quota: 365,
  duration_days: 1095,
  plan_type: "subscription",
};

// ─── MockProvider ───────────────────────────────────────────────────────────
describe("MockProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("createPaymentUrl builds a local mock payment URL", async () => {
    const provider = new MockProvider();
    const result = await provider.createPaymentUrl("SO1", 89, "单条解锁");
    expect(result.pay_url).toContain("/mock-payment?order_no=SO1");
    expect(result.pay_url).toContain("amount=89");
    expect(result.pay_url).toContain(`desc=${encodeURIComponent("单条解锁")}`);
    expect(result.qr_code_url).toBeUndefined();
  });

  it("order auto-pays after 5 seconds", async () => {
    const provider = new MockProvider();
    await provider.createPaymentUrl("SO1", 89, "x");

    // 5 秒前仍是 pending
    expect((await provider.queryOrderStatus("SO1")).status).toBe("pending");
    vi.advanceTimersByTime(5000);
    const paid = await provider.queryOrderStatus("SO1");
    expect(paid.status).toBe("paid");
    expect(paid.provider_trade_no).toMatch(/^MOCK_/);
  });

  it("unknown order is reported closed", async () => {
    const provider = new MockProvider();
    await expect(provider.queryOrderStatus("NOPE")).resolves.toEqual({ status: "closed" });
  });

  it("verifyCallback always verifies in mock mode", async () => {
    const provider = new MockProvider();
    const result = await provider.verifyCallback({}, "any-signature");
    expect(result.verified).toBe(true);
    expect(result.order_no).toBe("mock_order");
  });
});

// ─── PaymentService.createOrder ─────────────────────────────────────────────
describe("PaymentService.createOrder", () => {
  const buildService = (strategy = makeStrategy()) => {
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);
    return { service, strategy };
  };

  it("throws USER_AND_PLAN_REQUIRED when user_key or plan_code missing", async () => {
    const { service } = buildService();
    const pool = createPool();
    await expect(
      service.createOrder(pool, { user_key: "", plan_code: "annual", provider: "mock" } as any)
    ).rejects.toThrow("USER_AND_PLAN_REQUIRED");
    await expect(
      service.createOrder(pool, { user_key: "a@b.com", plan_code: "", provider: "mock" } as any)
    ).rejects.toThrow("USER_AND_PLAN_REQUIRED");
  });

  it("throws PLAN_NOT_FOUND for unknown plan", async () => {
    const { service } = buildService();
    const pool = createPool([[]]);
    await expect(
      service.createOrder(pool, { user_key: "a@b.com", plan_code: "ghost", provider: "mock" } as any)
    ).rejects.toThrow("PLAN_NOT_FOUND");
  });

  it("throws NOTICE_ID_REQUIRED for single plan without notice_id", async () => {
    const { service } = buildService();
    const pool = createPool([[{ ...annualPlan, plan_code: "single", plan_type: "single" }]]);
    await expect(
      service.createOrder(pool, { user_key: "a@b.com", plan_code: "single", provider: "mock" } as any)
    ).rejects.toThrow("NOTICE_ID_REQUIRED");
  });

  it("throws FREE_PLAN_NO_PAYMENT_REQUIRED for zero-price plan", async () => {
    const { service } = buildService();
    const pool = createPool([[{ ...annualPlan, plan_code: "free", price: 0 }]]);
    await expect(
      service.createOrder(pool, { user_key: "a@b.com", plan_code: "free", provider: "mock" } as any)
    ).rejects.toThrow("FREE_PLAN_NO_PAYMENT_REQUIRED");
  });

  it("creates a new pending order and inserts it into DB", async () => {
    const strategy = makeStrategy();
    const { service } = buildService(strategy);
    // 套餐查询 + 无 pending 订单
    const pool = createPool([[annualPlan], []]);

    const result = await service.createOrder(pool, {
      user_key: " A@B.com ",
      plan_code: "annual",
      provider: "mock",
      return_url: "https://site.com/return",
    } as any);

    expect(result.order_no).toMatch(/^SO\d{16}$/);
    expect(result.amount).toBe(5600);
    expect(result.currency).toBe("CNY");
    expect(result.status).toBe("pending");
    expect(result.pay_url).toBe(`https://pay.example/${result.order_no}`);

    // 归一化后的 user_key 参与落库
    const insertParams = pool.execute.mock.calls[0][1];
    expect(insertParams[0]).toBe("a@b.com");

    // return_url 拼接了 order_no
    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toContain("https://site.com/return?order_no=");
  });

  it("appends params after the hash for SPA return URLs", async () => {
    const strategy = makeStrategy();
    const { service } = buildService(strategy);
    const pool = createPool([[annualPlan], []]);

    await service.createOrder(pool, {
      user_key: "a@b.com",
      plan_code: "annual",
      provider: "mock",
      return_url: "https://site.com/#/callback",
    } as any);

    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toMatch(/^https:\/\/site\.com\/#\/callback\?order_no=/);
  });

  it("reuses an existing pending order via UPDATE", async () => {
    const { service } = buildService();
    const pool = createPool([[annualPlan], [{ order_no: "SO_EXISTING" }]]);

    const result = await service.createOrder(pool, {
      user_key: "a@b.com",
      plan_code: "annual",
      provider: "mock",
    } as any);

    expect(result.order_no).toBe("SO_EXISTING");
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("UPDATE crm_payment_orders");
    expect(params[params.length - 1]).toBe("SO_EXISTING");
  });
});

// ─── PaymentService.queryOrder ──────────────────────────────────────────────
describe("PaymentService.queryOrder", () => {
  it("returns closed when order not found", async () => {
    const service = new PaymentService();
    const pool = createPool([[]]);
    await expect(service.queryOrder(pool, "NOPE")).resolves.toEqual({
      order_no: "NOPE",
      status: "closed",
    });
  });

  it("returns DB status directly for already-paid orders (no provider polling)", async () => {
    const strategy = makeStrategy();
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);
    const pool = createPool([
      [{
        order_no: "SO1", provider: "mock", plan_code: "annual", amount: "5600",
        currency: "CNY", status: "paid", notice_id: null,
        provider_trade_no: "MOCK-1", paid_at: "2026-01-01",
      }],
    ]);

    const result = await service.queryOrder(pool, "SO1");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(5600);
    expect(strategy.queryOrderStatus).not.toHaveBeenCalled();
  });

  it("activates a subscription plan when provider reports paid", async () => {
    const strategy = makeStrategy({
      queryOrderStatus: vi.fn().mockResolvedValue({ status: "paid", provider_trade_no: "TRADE-9" }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      // 1) 订单查询（pending）
      [{
        order_no: "SO1", provider: "mock", plan_code: "annual", amount: "5600",
        currency: "CNY", status: "pending", notice_id: null,
      }],
      // 2) activatePaidOrder 重查订单
      [{ user_key: "a@b.com", plan_code: "annual", notice_id: null, amount: 5600 }],
      // 3) 套餐
      [{ plan_code: "annual", unlock_quota: 365, duration_days: 1095, plan_type: "subscription" }],
      // 4) 已有权益幂等检查
      [],
    ]);

    const result = await service.queryOrder(pool, "SO1");
    expect(result.status).toBe("paid");
    expect(result.plan_code).toBe("annual");

    // 4 次 execute：标记已付、写订阅、写权益、升级 VIP
    expect(pool.execute).toHaveBeenCalledTimes(4);
    expect(pool.execute.mock.calls[0][0]).toContain("SET status = 'paid'");
    expect(pool.execute.mock.calls[1][0]).toContain("crm_user_subscriptions");
    expect(pool.execute.mock.calls[2][0]).toContain("crm_user_entitlements");
    expect(pool.execute.mock.calls[3][0]).toContain("membership_tier = 'vip'");
  });

  it("grants a single unlock with unspsc snapshot for single plans", async () => {
    const strategy = makeStrategy({
      queryOrderStatus: vi.fn().mockResolvedValue({ status: "paid", provider_trade_no: "T" }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      [{
        order_no: "SO1", provider: "mock", plan_code: "single", amount: "89",
        currency: "CNY", status: "pending", notice_id: 42,
      }],
      [{ user_key: "a@b.com", plan_code: "single", notice_id: 42, amount: 89 }],
      [{ plan_code: "single", unlock_quota: null, duration_days: null, plan_type: "single" }],
      // grantSingleNoticeUnlock：未解锁过
      [],
      // 公告行（unspsc_codes 为 JSON 字符串）
      [{ id: 42, unspsc_codes: '["23000000"]' }],
    ]);

    await service.queryOrder(pool, "SO1");

    const unlockInsert = pool.execute.mock.calls.find((call: any[]) =>
      String(call[0]).includes("crm_opportunity_unlocks")
    );
    expect(unlockInsert).toBeTruthy();
    expect(unlockInsert![1]).toEqual([
      "a@b.com", "a@b.com", 42, 89, JSON.stringify(["23000000"]),
    ]);
    // 同时写入公告订阅兴趣
    const interestInsert = pool.execute.mock.calls.find((call: any[]) =>
      String(call[0]).includes("crm_notice_interests")
    );
    expect(interestInsert).toBeTruthy();
  });

  it("skips double activation when entitlement already exists", async () => {
    const strategy = makeStrategy({
      queryOrderStatus: vi.fn().mockResolvedValue({ status: "paid" }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      [{
        order_no: "SO1", provider: "mock", plan_code: "annual", amount: "5600",
        currency: "CNY", status: "pending", notice_id: null,
      }],
      [{ user_key: "a@b.com", plan_code: "annual", notice_id: null, amount: 5600 }],
      [{ plan_code: "annual", unlock_quota: 365, duration_days: 1095, plan_type: "subscription" }],
      // 幂等命中：权益已发放
      [{ id: 1 }],
    ]);

    const result = await service.queryOrder(pool, "SO1");
    expect(result.status).toBe("paid");
    // 仅标记已付一次 execute，不再写订阅/权益/VIP
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  it("keeps DB status when provider polling throws", async () => {
    const strategy = makeStrategy({
      queryOrderStatus: vi.fn().mockRejectedValue(new Error("gateway down")),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      [{
        order_no: "SO1", provider: "mock", plan_code: "annual", amount: "5600",
        currency: "CNY", status: "pending", notice_id: null,
      }],
    ]);

    const result = await service.queryOrder(pool, "SO1");
    expect(result.status).toBe("pending");
  });

  it("passes through non-pending provider statuses", async () => {
    const strategy = makeStrategy({
      queryOrderStatus: vi.fn().mockResolvedValue({ status: "closed" }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      [{
        order_no: "SO1", provider: "mock", plan_code: "annual", amount: "5600",
        currency: "CNY", status: "pending", notice_id: null,
      }],
    ]);

    const result = await service.queryOrder(pool, "SO1");
    expect(result.status).toBe("closed");
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ─── PaymentService.handleNotify / strategy registry ────────────────────────
describe("PaymentService.handleNotify & registry", () => {
  it("rejects when signature verification fails", async () => {
    const strategy = makeStrategy({
      verifyCallback: vi.fn().mockResolvedValue({
        verified: false, order_no: "SO1", provider_trade_no: "", amount: 0,
      }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const result = await service.handleNotify(createPool(), "mock", {}, "bad-sign");
    expect(result).toMatchObject({ success: false, message: "SIGN_VERIFY_FAILED" });
  });

  it("rejects when verified but order_no missing", async () => {
    const strategy = makeStrategy({
      verifyCallback: vi.fn().mockResolvedValue({
        verified: true, order_no: "", provider_trade_no: "", amount: 0,
      }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const result = await service.handleNotify(createPool(), "mock", {}, "sign");
    expect(result).toMatchObject({ success: false, message: "ORDER_NO_MISSING" });
  });

  it("activates the order on verified notify", async () => {
    const strategy = makeStrategy({
      verifyCallback: vi.fn().mockResolvedValue({
        verified: true, order_no: "SO1", provider_trade_no: "TRADE-1", amount: 5600,
      }),
    });
    const service = new PaymentService();
    service.registerStrategy("mock", strategy as any);

    const pool = createPool([
      [{ user_key: "a@b.com", plan_code: "annual", notice_id: null, amount: 5600 }],
      [{ plan_code: "annual", unlock_quota: 365, duration_days: 1095, plan_type: "subscription" }],
      [],
    ]);

    const result = await service.handleNotify(pool, "mock", {}, "sign");
    expect(result).toEqual({ success: true, order_no: "SO1" });
    expect(pool.execute.mock.calls[0][1]).toEqual(["TRADE-1", "SO1"]);
  });

  it("getStrategy throws for unregistered providers", () => {
    const service = new PaymentService();
    expect(() => service.getStrategy("alipay")).toThrow("Unsupported payment provider: alipay");
  });

  it("initDefault('mock') registers only the mock strategy", () => {
    const service = PaymentService.initDefault("mock");
    expect(service.getStrategy("mock")).toBeTruthy();
    expect(() => service.getStrategy("wechat")).toThrow();
  });
});
