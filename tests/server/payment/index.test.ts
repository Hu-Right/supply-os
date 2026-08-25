/**
 * server/payment/ 测试
 * 覆盖 keys.ts (normalizePem, isParseablePrivateKey, isParseablePublicKey),
 *       MockProvider.ts (createPaymentUrl, verifyCallback, queryOrderStatus),
 *       PaymentService.ts (registerStrategy, hasStrategy, getStrategy),
 *       fulfillment.ts (activatePaidOrder, fulfillMockPayment, activateSubscription)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// ── keys.ts ──
import { normalizePem, isParseablePrivateKey, isParseablePublicKey } from "../../../server/payment/keys";

describe("normalizePem", () => {
  it("已有 BEGIN/END 包裹时原样返回（trim 后）", () => {
    const input = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n";
    // normalizePem 对输入做 trim，尾部 \n 被去除
    const expected = input.trim();
    expect(normalizePem(input, "PRIVATE KEY")).toBe(expected);
  });

  it("无包裹时自动补全 BEGIN/END 并 64 字符折行", () => {
    const rawBody = "a".repeat(128);
    const result = normalizePem(rawBody, "PRIVATE KEY");
    expect(result).toContain("-----BEGIN PRIVATE KEY-----");
    expect(result).toContain("-----END PRIVATE KEY-----");
    // 128 字符 → 2 行 64 字符
    const lines = result.split("\n").filter(Boolean);
    expect(lines).toHaveLength(4); // BEGIN + 2 body + END
  });

  it("空字符串返回空", () => {
    expect(normalizePem("", "PUBLIC KEY")).toBe("");
    expect(normalizePem("  ", "PUBLIC KEY")).toBe("");
  });
});

// 生成测试用 RSA 密钥对
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("isParseablePrivateKey", () => {
  it("有效 PEM 私钥返回 true", () => {
    expect(isParseablePrivateKey(privateKey)).toBe(true);
  });

  it("占位符返回 false", () => {
    expect(isParseablePrivateKey("your-private-key-here")).toBe(false);
    expect(isParseablePrivateKey("")).toBe(false);
  });

  it("无包裹的 base64 密钥体也能识别", () => {
    // 提取 PEM 中间部分
    const body = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, "");
    expect(isParseablePrivateKey(body)).toBe(true);
  });
});

describe("isParseablePublicKey", () => {
  it("有效 PEM 公钥返回 true", () => {
    expect(isParseablePublicKey(publicKey)).toBe(true);
  });

  it("占位符返回 false", () => {
    expect(isParseablePublicKey("fake-key")).toBe(false);
    expect(isParseablePublicKey("")).toBe(false);
  });
});

// ── MockProvider ──
import { MockProvider } from "../../../server/payment/MockProvider";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new MockProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("name 为 mock", () => {
    expect(provider.name).toBe("mock");
  });

  it("createPaymentUrl 返回 pay_url", async () => {
    const result = await provider.createPaymentUrl("ORD-001", 99.9, "测试订单");
    expect(result.pay_url).toContain("ORD-001");
    expect(result.pay_url).toContain("99.9");
  });

  it("创建后初始状态为 pending", async () => {
    await provider.createPaymentUrl("ORD-002", 50, "desc");
    const status = await provider.queryOrderStatus("ORD-002");
    expect(status.status).toBe("pending");
  });

  it("5 秒后自动变为 paid", async () => {
    await provider.createPaymentUrl("ORD-003", 100, "desc");
    vi.advanceTimersByTime(5000);
    const status = await provider.queryOrderStatus("ORD-003");
    expect(status.status).toBe("paid");
    expect(status.provider_trade_no).toBeTruthy();
  });

  it("不存在的订单返回 closed", async () => {
    const status = await provider.queryOrderStatus("NONEXISTENT");
    expect(status.status).toBe("closed");
  });

  it("verifyCallback 总是返回 verified=true", async () => {
    const result = await provider.verifyCallback({}, "sig");
    expect(result.verified).toBe(true);
    expect(result.order_no).toBe("mock_order");
  });
});

// ── PaymentService ──
import { PaymentService } from "../../../server/payment/PaymentService";

describe("PaymentService", () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
  });

  it("初始无策略", () => {
    expect(service.hasStrategy("mock")).toBe(false);
    expect(service.hasStrategy("alipay")).toBe(false);
  });

  it("registerStrategy + hasStrategy", () => {
    const mockStrategy = { name: "mock" as const } as any;
    service.registerStrategy("mock", mockStrategy);
    expect(service.hasStrategy("mock")).toBe(true);
  });

  it("getStrategy 返回已注册策略", () => {
    const mockStrategy = { name: "mock" as const } as any;
    service.registerStrategy("mock", mockStrategy);
    expect(service.getStrategy("mock")).toBe(mockStrategy);
  });

  it("getStrategy 未注册抛异常", () => {
    expect(() => service.getStrategy("alipay")).toThrow("Unsupported payment provider");
  });
});

// ── fulfillment.ts ──
import { activatePaidOrder, fulfillMockPayment, activateSubscription } from "../../../server/payment/fulfillment";

describe("activatePaidOrder", () => {
  function makeMockRepo() {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const repo = {
      getConnection: vi.fn().mockResolvedValue(conn),
      findOrderForUpdate: vi.fn(),
      markAsPaidInTransaction: vi.fn().mockResolvedValue(undefined),
      findPlanInTransaction: vi.fn(),
      hasEntitlementForOrder: vi.fn().mockResolvedValue(false),
      insertEntitlementInTransaction: vi.fn().mockResolvedValue(undefined),
      createSubscriptionInTransaction: vi.fn().mockResolvedValue(undefined),
      promoteToVipInTransaction: vi.fn().mockResolvedValue(undefined),
    } as any;
    return { repo, conn };
  }

  it("订单不存在时直接 commit + release", async () => {
    const { repo, conn } = makeMockRepo();
    repo.findOrderForUpdate.mockResolvedValue(null);
    await activatePaidOrder(repo, "NO-ORDER");
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it("订单已 paid 幂等跳过", async () => {
    const { repo, conn } = makeMockRepo();
    repo.findOrderForUpdate.mockResolvedValue({ status: "paid", order_no: "ORD-001" });
    await activatePaidOrder(repo, "ORD-001");
    expect(repo.markAsPaidInTransaction).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });

  it("单次卡订单创建 entitlement", async () => {
    const { repo, conn } = makeMockRepo();
    repo.findOrderForUpdate.mockResolvedValue({
      status: "pending", order_no: "ORD-001", order_type: "new",
      user_key: "user1", plan_code: "SINGLE_1", notice_id: null,
    });
    repo.findPlanInTransaction.mockResolvedValue({
      plan_type: "single", unlock_quota: 5, duration_days: 30,
    });
    repo.hasEntitlementForOrder.mockResolvedValue(false);

    await activatePaidOrder(repo, "ORD-001");
    expect(repo.markAsPaidInTransaction).toHaveBeenCalled();
    expect(repo.insertEntitlementInTransaction).toHaveBeenCalled();
    // 单次卡不创建订阅
    expect(repo.createSubscriptionInTransaction).not.toHaveBeenCalled();
    expect(repo.promoteToVipInTransaction).not.toHaveBeenCalled();
  });

  it("订阅卡订单创建订阅 + 升 VIP", async () => {
    const { repo, conn } = makeMockRepo();
    repo.findOrderForUpdate.mockResolvedValue({
      status: "pending", order_no: "ORD-002", order_type: "new",
      user_key: "user2", plan_code: "PRO_YEAR", notice_id: null,
    });
    repo.findPlanInTransaction.mockResolvedValue({
      plan_type: "subscription", unlock_quota: 100, duration_days: 365,
    });
    repo.hasEntitlementForOrder.mockResolvedValue(false);

    await activatePaidOrder(repo, "ORD-002");
    expect(repo.createSubscriptionInTransaction).toHaveBeenCalled();
    expect(repo.promoteToVipInTransaction).toHaveBeenCalled();
  });

  it("异常时 rollback + release", async () => {
    const { repo, conn } = makeMockRepo();
    repo.findOrderForUpdate.mockRejectedValue(new Error("DB error"));
    await expect(activatePaidOrder(repo, "ORD-ERR")).rejects.toThrow("DB error");
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

describe("fulfillMockPayment", () => {
  function makeMocks() {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const paymentsRepo = {
      getConnection: vi.fn().mockResolvedValue(conn),
      findByOrderNo: vi.fn(),
      markAsMockPaidInTransaction: vi.fn().mockResolvedValue(undefined),
      insertEntitlementInTransaction: vi.fn().mockResolvedValue(undefined),
      createSubscriptionInTransaction: vi.fn().mockResolvedValue(undefined),
      promoteToVipInTransaction: vi.fn().mockResolvedValue(undefined),
      upsertNoticeInterestInTransaction: vi.fn().mockResolvedValue(undefined),
    } as any;
    const membershipRepo = {
      findPlanByCodeForFulfillment: vi.fn(),
    } as any;
    return { paymentsRepo, membershipRepo, conn };
  }

  it("订单不存在返回 found=false", async () => {
    const { paymentsRepo, membershipRepo } = makeMocks();
    paymentsRepo.findByOrderNo.mockResolvedValue(null);
    const result = await fulfillMockPayment(paymentsRepo, membershipRepo, { orderNo: "NO", rawNotify: "{}" });
    expect(result.found).toBe(false);
  });

  it("已 paid 订单直接返回 found=true", async () => {
    const { paymentsRepo, membershipRepo } = makeMocks();
    paymentsRepo.findByOrderNo.mockResolvedValue({ status: "paid", order_no: "ORD-001" });
    const result = await fulfillMockPayment(paymentsRepo, membershipRepo, { orderNo: "ORD-001", rawNotify: "{}" });
    expect(result.found).toBe(true);
    expect(paymentsRepo.markAsMockPaidInTransaction).not.toHaveBeenCalled();
  });

  it("pending 单次卡订单发放 entitlement", async () => {
    const { paymentsRepo, membershipRepo, conn } = makeMocks();
    paymentsRepo.findByOrderNo.mockResolvedValue({
      status: "pending", order_no: "ORD-002", order_type: "new",
      user_key: "user1", plan_code: "SINGLE_1", notice_id: null,
    });
    membershipRepo.findPlanByCodeForFulfillment.mockResolvedValue({
      plan_type: "single", unlock_quota: 3, duration_days: null,
    });

    const result = await fulfillMockPayment(paymentsRepo, membershipRepo, { orderNo: "ORD-002", rawNotify: "{}" });
    expect(result.found).toBe(true);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(paymentsRepo.markAsMockPaidInTransaction).toHaveBeenCalled();
    expect(paymentsRepo.insertEntitlementInTransaction).toHaveBeenCalled();
    // 单次卡不创建订阅
    expect(paymentsRepo.createSubscriptionInTransaction).not.toHaveBeenCalled();
  });

  it("有 notice_id 时记录兴趣", async () => {
    const { paymentsRepo, membershipRepo } = makeMocks();
    paymentsRepo.findByOrderNo.mockResolvedValue({
      status: "pending", order_no: "ORD-003", order_type: "new",
      user_key: "user1", plan_code: "SINGLE_1", notice_id: 42,
    });
    membershipRepo.findPlanByCodeForFulfillment.mockResolvedValue({
      plan_type: "single", unlock_quota: 1, duration_days: null,
    });

    await fulfillMockPayment(paymentsRepo, membershipRepo, { orderNo: "ORD-003", rawNotify: "{}" });
    expect(paymentsRepo.upsertNoticeInterestInTransaction).toHaveBeenCalled();
  });
});

describe("activateSubscription", () => {
  function makeMocks() {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const paymentsRepo = {
      getConnection: vi.fn().mockResolvedValue(conn),
      createSubscriptionInTransaction: vi.fn().mockResolvedValue(undefined),
      promoteToVipInTransaction: vi.fn().mockResolvedValue(undefined),
    } as any;
    const membershipRepo = {
      findPlanByCode: vi.fn(),
    } as any;
    return { paymentsRepo, membershipRepo, conn };
  }

  it("套餐不存在返回 null", async () => {
    const { paymentsRepo, membershipRepo } = makeMocks();
    membershipRepo.findPlanByCode.mockResolvedValue(null);
    const result = await activateSubscription(paymentsRepo, membershipRepo, { userKey: "u1", planCode: "NOPE" });
    expect(result).toBeNull();
  });

  it("成功开通返回 planCode/price/quota", async () => {
    const { paymentsRepo, membershipRepo, conn } = makeMocks();
    membershipRepo.findPlanByCode.mockResolvedValue({
      price: 299, unlock_quota: 50, duration_days: 180,
    });

    const result = await activateSubscription(paymentsRepo, membershipRepo, { userKey: "u1", planCode: "PRO" });
    expect(result).toEqual({ planCode: "PRO", price: 299, quota: 50 });
    expect(paymentsRepo.createSubscriptionInTransaction).toHaveBeenCalled();
    expect(paymentsRepo.promoteToVipInTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });
});
