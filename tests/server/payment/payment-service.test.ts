/**
 * server/payment/PaymentService — createOrder / queryOrder / handleNotify / initDefault 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentService } from "../../../server/payment/PaymentService";

vi.mock("../../../server/payment/AlipayProvider", () => ({
  AlipayProvider: function(this: any) {
    Object.assign(this, {
      name: "alipay" as const,
      createPaymentUrl: vi.fn().mockResolvedValue({ pay_url: "https://alipay.test", qr_code_url: "" }),
      verifyCallback: vi.fn(),
      queryOrderStatus: vi.fn(),
    });
  },
}));

vi.mock("../../../server/payment/WechatProvider", () => ({
  WechatProvider: function(this: any) {
    Object.assign(this, {
      name: "wechat" as const,
      createPaymentUrl: vi.fn().mockResolvedValue({ pay_url: "https://wechat.test", qr_code_url: "" }),
      verifyCallback: vi.fn(),
      queryOrderStatus: vi.fn(),
    });
  },
}));

vi.mock("../../../server/payment/keys", () => ({
  isParseablePrivateKey: vi.fn(() => true),
}));

function createMockRepos() {
  const paymentsRepo = {
    findActivePlan: vi.fn(),
    findPendingOrder: vi.fn(),
    createOrder: vi.fn(),
    updatePendingOrder: vi.fn(),
    findByOrderNo: vi.fn(),
    findOrderAmount: vi.fn(),
  } as any;
  const membershipRepo = {
    findCurrentBestPlan: vi.fn(),
  } as any;
  return { paymentsRepo, membershipRepo };
}

function createMockStrategy() {
  return {
    name: "mock" as const,
    createPaymentUrl: vi.fn().mockResolvedValue({ pay_url: "https://pay.test", qr_code_url: "https://qr.test" }),
    verifyCallback: vi.fn(),
    queryOrderStatus: vi.fn(),
  };
}

describe("PaymentService — createOrder", () => {
  let service: PaymentService;
  let repos: ReturnType<typeof createMockRepos>;
  let strategy: ReturnType<typeof createMockStrategy>;

  beforeEach(() => {
    repos = createMockRepos();
    service = new PaymentService(repos.paymentsRepo, repos.membershipRepo);
    strategy = createMockStrategy();
    service.registerStrategy("mock", strategy);
  });

  it("新建订单成功", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "pro", price: 99, name: "Pro", currency: "CNY" });
    repos.paymentsRepo.findPendingOrder.mockResolvedValue(null);
    repos.paymentsRepo.createOrder.mockResolvedValue(undefined);

    const result = await service.createOrder({
      user_key: "User@Example.com",
      plan_code: "pro",
      provider: "mock",
    });

    expect(result.order_no).toMatch(/^SO\d{8}/);
    expect(result.provider).toBe("mock");
    expect(result.amount).toBe(99);
    expect(result.status).toBe("pending");
    expect(result.pay_url).toBe("https://pay.test");
    expect(repos.paymentsRepo.createOrder).toHaveBeenCalledOnce();
  });

  it("user_key 自动 trim + lowercase", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "pro", price: 50, name: "Pro", currency: "CNY" });
    repos.paymentsRepo.findPendingOrder.mockResolvedValue(null);
    repos.paymentsRepo.createOrder.mockResolvedValue(undefined);

    await service.createOrder({ user_key: "  USER@Test.COM  ", plan_code: "pro", provider: "mock" });

    const call = repos.paymentsRepo.createOrder.mock.calls[0][0];
    expect(call.userKey).toBe("user@test.com");
  });

  it("缺少 user_key 或 plan_code 抛错", async () => {
    await expect(service.createOrder({ user_key: "", plan_code: "pro", provider: "mock" })).rejects.toThrow("USER_AND_PLAN_REQUIRED");
    await expect(service.createOrder({ user_key: "u@t.com", plan_code: "", provider: "mock" })).rejects.toThrow("USER_AND_PLAN_REQUIRED");
  });

  it("套餐不存在抛错", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue(null);
    await expect(service.createOrder({ user_key: "u@t.com", plan_code: "xxx", provider: "mock" })).rejects.toThrow("PLAN_NOT_FOUND");
  });

  it("免费套餐(price=0)不允许下单", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "free", price: 0, name: "Free", currency: "CNY" });
    await expect(service.createOrder({ user_key: "u@t.com", plan_code: "free", provider: "mock" })).rejects.toThrow("FREE_PLAN_NO_PAYMENT_REQUIRED");
  });

  it("存在 pending 订单时复用 order_no", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "pro", price: 99, name: "Pro", currency: "USD" });
    repos.paymentsRepo.findPendingOrder.mockResolvedValue({ order_no: "SO-EXISTING" });
    repos.paymentsRepo.updatePendingOrder.mockResolvedValue(undefined);

    const result = await service.createOrder({ user_key: "u@t.com", plan_code: "pro", provider: "mock" });

    expect(result.order_no).toBe("SO-EXISTING");
    expect(repos.paymentsRepo.updatePendingOrder).toHaveBeenCalledOnce();
    expect(repos.paymentsRepo.createOrder).not.toHaveBeenCalled();
  });

  it("升级订单：计算差价", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "enterprise", price: 299, name: "Ent", currency: "CNY" });
    repos.membershipRepo.findCurrentBestPlan.mockResolvedValue({ plan_code: "pro", price: 99, source_order_no: "SO-OLD" });

    const result = await service.createOrder({
      user_key: "u@t.com", plan_code: "enterprise", provider: "mock", order_type: "upgrade",
    });

    expect(result.amount).toBe(200); // 299 - 99
    expect(result.order_no).toMatch(/^SO\d{8}/); // 升级订单始终新建
  });

  it("升级订单：无活跃套餐不可升级", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "enterprise", price: 299, name: "Ent", currency: "CNY" });
    repos.membershipRepo.findCurrentBestPlan.mockResolvedValue(null);

    await expect(service.createOrder({
      user_key: "u@t.com", plan_code: "enterprise", provider: "mock", order_type: "upgrade",
    })).rejects.toThrow("NO_ACTIVE_PLAN_TO_UPGRADE");
  });

  it("不支持降级", async () => {
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "basic", price: 29, name: "Basic", currency: "CNY" });
    repos.membershipRepo.findCurrentBestPlan.mockResolvedValue({ plan_code: "pro", price: 99, source_order_no: "SO-OLD" });

    await expect(service.createOrder({
      user_key: "u@t.com", plan_code: "basic", provider: "mock", order_type: "upgrade",
    })).rejects.toThrow("CANNOT_DOWNGRADE");
  });
});

describe("PaymentService — queryOrder", () => {
  let service: PaymentService;
  let repos: ReturnType<typeof createMockRepos>;
  let strategy: ReturnType<typeof createMockStrategy>;

  beforeEach(() => {
    repos = createMockRepos();
    service = new PaymentService(repos.paymentsRepo);
    strategy = createMockStrategy();
    service.registerStrategy("mock", strategy);
  });

  it("订单不存在返回 closed", async () => {
    repos.paymentsRepo.findByOrderNo.mockResolvedValue(null);
    const result = await service.queryOrder("NOT-EXIST");
    expect(result.status).toBe("closed");
  });

  it("已支付订单直接返回", async () => {
    repos.paymentsRepo.findByOrderNo.mockResolvedValue({
      order_no: "ORD-001", status: "paid", provider: "mock", plan_code: "pro",
      amount: 99, currency: "CNY", notice_id: null,
    });
    const result = await service.queryOrder("ORD-001");
    expect(result.status).toBe("paid");
    expect(strategy.queryOrderStatus).not.toHaveBeenCalled();
  });

  it("pending 订单 → 查询策略 → paid → 激活", async () => {
    repos.paymentsRepo.findByOrderNo.mockResolvedValue({
      order_no: "ORD-002", status: "pending", provider: "mock", plan_code: "pro",
      amount: 99, currency: "CNY", notice_id: null,
    });
    strategy.queryOrderStatus.mockResolvedValue({ status: "paid", provider_trade_no: "TX-001" });
    // activatePaidOrder 内部调用 repo，mock 一个事务方法
    vi.spyOn(repos.paymentsRepo, "findByOrderNo").mockResolvedValueOnce({
      order_no: "ORD-002", status: "pending", provider: "mock", plan_code: "pro",
      amount: 99, currency: "CNY", notice_id: null,
    });

    const result = await service.queryOrder("ORD-002");
    expect(strategy.queryOrderStatus).toHaveBeenCalledWith("ORD-002", undefined);
  });

  it("pending 订单 → 策略查询仍 pending → 返回 DB 状态", async () => {
    repos.paymentsRepo.findByOrderNo.mockResolvedValue({
      order_no: "ORD-003", status: "pending", provider: "mock", plan_code: "pro",
      amount: 50, currency: "CNY", notice_id: null,
    });
    strategy.queryOrderStatus.mockResolvedValue({ status: "pending" });

    const result = await service.queryOrder("ORD-003");
    expect(result.status).toBe("pending");
  });
});

describe("PaymentService — handleNotify", () => {
  let service: PaymentService;
  let repos: ReturnType<typeof createMockRepos>;
  let strategy: ReturnType<typeof createMockStrategy>;

  beforeEach(() => {
    repos = createMockRepos();
    service = new PaymentService(repos.paymentsRepo);
    strategy = createMockStrategy();
    service.registerStrategy("mock", strategy);
  });

  it("验签失败返回 SIGN_VERIFY_FAILED", async () => {
    strategy.verifyCallback.mockResolvedValue({ verified: false, order_no: "ORD-001", provider_trade_no: "", amount: 0 });

    const result = await service.handleNotify("mock", {}, "bad-sig");
    expect(result.success).toBe(false);
    expect(result.message).toBe("SIGN_VERIFY_FAILED");
  });

  it("订单号缺失返回 ORDER_NO_MISSING", async () => {
    strategy.verifyCallback.mockResolvedValue({ verified: true, order_no: "", provider_trade_no: "", amount: 100 });

    const result = await service.handleNotify("mock", {}, "sig");
    expect(result.success).toBe(false);
    expect(result.message).toBe("ORDER_NO_MISSING");
  });

  it("回调金额为 0 返回 AMOUNT_INVALID", async () => {
    strategy.verifyCallback.mockResolvedValue({ verified: true, order_no: "ORD-001", provider_trade_no: "TX", amount: 0 });

    const result = await service.handleNotify("mock", {}, "sig");
    expect(result.success).toBe(false);
    expect(result.message).toBe("AMOUNT_INVALID");
  });

  it("金额不匹配返回 AMOUNT_MISMATCH", async () => {
    strategy.verifyCallback.mockResolvedValue({ verified: true, order_no: "ORD-001", provider_trade_no: "TX", amount: 50 });
    repos.paymentsRepo.findOrderAmount.mockResolvedValue({ amount: 99 });

    const result = await service.handleNotify("mock", {}, "sig");
    expect(result.success).toBe(false);
    expect(result.message).toBe("AMOUNT_MISMATCH");
  });
});

describe("PaymentService — initDefault", () => {
  it("mock 模式只注册 mock 策略", () => {
    const service = PaymentService.initDefault({} as any, "mock");
    expect(service.hasStrategy("mock")).toBe(true);
    expect(service.hasStrategy("alipay")).toBe(false);
    expect(service.hasStrategy("wechat")).toBe(false);
  });

  it("live 模式无环境变量只注册 mock", () => {
    const origEnv = { ...process.env };
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_PRIVATE_KEY;
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_MCH_ID;
    delete process.env.WECHAT_MERCHANT_ID;

    const service = PaymentService.initDefault({} as any, "live");
    expect(service.hasStrategy("mock")).toBe(true);
    expect(service.hasStrategy("alipay")).toBe(false);
    expect(service.hasStrategy("wechat")).toBe(false);

    process.env = origEnv;
  });

  it("live 模式配置支付宝环境变量 → 注册 alipay", () => {
    const origEnv = { ...process.env };
    process.env.ALIPAY_APP_ID = "test-app-id";
    process.env.ALIPAY_PRIVATE_KEY = "test-key";
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_MCH_ID;

    const service = PaymentService.initDefault({} as any, "live");
    expect(service.hasStrategy("alipay")).toBe(true);

    process.env = origEnv;
  });

  it("live 模式配置微信环境变量 → 注册 wechat", () => {
    const origEnv = { ...process.env };
    delete process.env.ALIPAY_APP_ID;
    process.env.WECHAT_APP_ID = "wx-test";
    process.env.WECHAT_MCH_ID = "mch-test";

    const service = PaymentService.initDefault({} as any, "live");
    expect(service.hasStrategy("wechat")).toBe(true);

    process.env = origEnv;
  });
});

describe("PaymentService — getStrategy", () => {
  it("未注册策略抛错", () => {
    const service = new PaymentService();
    expect(() => service.getStrategy("mock")).toThrow("Unsupported payment provider");
  });
});

describe("PaymentService — appendUrlParams (via createOrder)", () => {
  let service: PaymentService;
  let repos: ReturnType<typeof createMockRepos>;
  let strategy: ReturnType<typeof createMockStrategy>;

  beforeEach(() => {
    repos = createMockRepos();
    service = new PaymentService(repos.paymentsRepo);
    strategy = createMockStrategy();
    service.registerStrategy("mock", strategy);
    repos.paymentsRepo.findActivePlan.mockResolvedValue({ plan_code: "pro", price: 99, name: "Pro", currency: "CNY" });
    repos.paymentsRepo.findPendingOrder.mockResolvedValue(null);
    repos.paymentsRepo.createOrder.mockResolvedValue(undefined);
  });

  it("return_url + notice_id → 参数插入 ? 前", async () => {
    await service.createOrder({
      user_key: "u@t.com", plan_code: "pro", provider: "mock",
      return_url: "https://example.com/cb", notice_id: 42,
    });
    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toContain("order_no=");
    expect(returnUrl).toContain("notice_id=42");
    expect(returnUrl).toMatch(/\?order_no=/);
  });

  it("return_url 含 # → 参数插入 # 前", async () => {
    await service.createOrder({
      user_key: "u@t.com", plan_code: "pro", provider: "mock",
      return_url: "https://example.com/cb#section",
    });
    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toMatch(/order_no=.*#section$/);
  });

  it("return_url 已有 ? → 用 & 连接", async () => {
    await service.createOrder({
      user_key: "u@t.com", plan_code: "pro", provider: "mock",
      return_url: "https://example.com/cb?existing=1",
    });
    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toMatch(/existing=1&order_no=/);
  });

  it("无 return_url → 返回空字符串", async () => {
    await service.createOrder({
      user_key: "u@t.com", plan_code: "pro", provider: "mock",
    });
    const returnUrl = strategy.createPaymentUrl.mock.calls[0][3];
    expect(returnUrl).toBe("");
  });
});
