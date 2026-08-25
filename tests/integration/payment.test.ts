/**
 * API 集成测试 — 支付域：配置 / 订单 / 通知 / 模拟支付
 * Integration tests for payment routes via supertest
 *
 * 覆盖端点：
 *   GET  /api/payment/config-status          — 公共支付配置状态
 *   POST /api/billing/subscribe              — 管理员开通套餐
 *   POST /api/payment/orders                 — 创建支付订单（需 JWT）
 *   GET  /api/payment/orders                 — 订单列表（需 JWT）
 *   GET  /api/payment/orders/:orderNo        — 查询订单（需 JWT）
 *   GET  /api/payment/unlocks                — 解锁历史（需 JWT）
 *   POST /api/payment/notify/alipay          — 支付宝异步通知
 *   POST /api/payment/notify/wechat          — 微信异步通知
 *   POST /api/payments/:orderNo/mock-paid    — 模拟支付（mock 模式）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import { createMockContext, createTestApp } from "./helpers";
import type { AppContext } from "./helpers";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock 支付服务 ──
vi.mock("../../server/services/paymentHistory", () => ({
  listOrderHistory: vi.fn(),
  listUnlockHistory: vi.fn(),
}));

vi.mock("../../server/payment/fulfillment", () => ({
  activateSubscription: vi.fn(),
  fulfillMockPayment: vi.fn(),
}));

vi.mock("../../server/payment/qr", () => ({
  toQrDataUrl: vi.fn((url: string) => Promise.resolve(`data:image/png;base64,${url}`)),
}));

vi.mock("../../server/config/env", () => ({
  getPaymentRuntimeConfig: vi.fn().mockReturnValue({
    payment_mode: "mock",
    live_enabled: false,
    providers: {
      alipay: { configured: false },
      wechat: { configured: false },
    },
  }),
}));

import { createPaymentRouter } from "../../server/routes/payment.routes";

/** 创建带完整 payment mock 的 context */
function createPaymentCtx(paymentMode = "mock") {
  return createMockContext({
    paymentMode,
    paymentService: {
      createOrder: vi.fn(),
      queryOrder: vi.fn(),
      handleNotify: vi.fn(),
      hasStrategy: vi.fn().mockReturnValue(false),
    },
    paymentsRepo: {
      findByOrderNo: vi.fn(),
      listActiveProviderConfigs: vi.fn().mockResolvedValue([]),
    },
  });
}

// ── GET /api/payment/config-status ──
describe("集成测试 — GET /api/payment/config-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("→ 200 公共配置状态（无需登录）", async () => {
    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/config-status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("providers");
    expect(res.body.providers).toHaveProperty("alipay");
    expect(res.body.providers).toHaveProperty("wechat");
  });
});

// ── POST /api/billing/subscribe ──
describe("集成测试 — POST /api/billing/subscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无管理员密钥 → 403", async () => {
    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app)
      .post("/api/billing/subscribe")
      .send({ user_key: "test@example.com", plan_code: "single" });
    expect(res.status).toBe(403);
  });

  it("缺少 user_key → 400", async () => {
    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    // 设置 ADMIN_API_TOKEN 并传入
    const origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = "test-admin-key";
    const res = await supertest(app)
      .post("/api/billing/subscribe")
      .send({ admin_key: "test-admin-key", plan_code: "single" });
    expect(res.status).toBe(400);
    process.env.ADMIN_API_TOKEN = origToken;
  });

  it("有效请求 → 201 开通成功", async () => {
    const { activateSubscription } = await import("../../server/payment/fulfillment");
    (activateSubscription as any).mockResolvedValue({ price: 9.99, quota: 10 });

    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    const origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = "test-admin-key";
    const res = await supertest(app)
      .post("/api/billing/subscribe")
      .send({ admin_key: "test-admin-key", user_key: "test@example.com", plan_code: "single" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.membership_tier).toBe("vip");
    process.env.ADMIN_API_TOKEN = origToken;
  });
});

// ── POST /api/payment/orders ──
describe("集成测试 — POST /api/payment/orders", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createPaymentCtx();
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).post("/api/payment/orders").send({});
    expect(res.status).toBe(401);
  });

  it("创建订单成功 → 201", async () => {
    (ctx.payment.paymentService.createOrder as any).mockResolvedValue({
      order_no: "PAY-001",
      pay_url: "/pay/PAY-001",
      qr_code_url: "https://qr.example.com/pay",
      provider: "mock",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app)
      .post("/api/payment/orders")
      .set(AUTH_HEADER)
      .send({ plan_code: "single", provider: "mock" });
    expect(res.status).toBe(201);
    expect(res.body.order_no).toBe("PAY-001");
    expect(res.body.payment_mode).toBe("mock");
  });
});

// ── GET /api/payment/orders ──
describe("集成测试 — GET /api/payment/orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 JWT → 401", async () => {
    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/orders");
    expect(res.status).toBe(401);
  });

  it("有 JWT → 200 订单列表", async () => {
    const { listOrderHistory } = await import("../../server/services/paymentHistory");
    (listOrderHistory as any).mockResolvedValue({
      orders: [{ order_no: "PAY-001", status: "paid" }],
      total: 1, page: 1, limit: 20,
    });

    const ctx = createPaymentCtx();
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/orders").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
  });
});

// ── GET /api/payment/orders/:orderNo ──
describe("集成测试 — GET /api/payment/orders/:orderNo", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createPaymentCtx();
  });

  it("订单不存在 → 404", async () => {
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue(null);

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/orders/FAKE-001").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it("订单不属于当前用户 → 403", async () => {
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue({
      order_no: "PAY-001", user_key: "other@example.com",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/orders/PAY-001").set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });

  it("查询成功 → 200", async () => {
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue({
      order_no: "PAY-001", user_key: "test@example.com",
    });
    (ctx.payment.paymentService.queryOrder as any).mockResolvedValue({
      order_no: "PAY-001", status: "paid",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).get("/api/payment/orders/PAY-001").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
  });
});

// ── POST /api/payment/notify/alipay ──
describe("集成测试 — POST /api/payment/notify/alipay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("→ 通知处理成功 → 'success'", async () => {
    const ctx = createPaymentCtx();
    (ctx.payment.paymentService.handleNotify as any).mockResolvedValue({ success: true });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app)
      .post("/api/payment/notify/alipay")
      .send({ sign: "test-sign", trade_no: "123" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("success");
  });

  it("→ 通知处理失败 → 'fail'", async () => {
    const ctx = createPaymentCtx();
    (ctx.payment.paymentService.handleNotify as any).mockResolvedValue({ success: false });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app)
      .post("/api/payment/notify/alipay")
      .send({ sign: "bad-sign" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("fail");
  });
});

// ── POST /api/payment/notify/wechat ──
describe("集成测试 — POST /api/payment/notify/wechat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("→ 通知处理成功 → SUCCESS", async () => {
    const ctx = createPaymentCtx();
    (ctx.payment.paymentService.handleNotify as any).mockResolvedValue({
      success: true, message: "OK",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app)
      .post("/api/payment/notify/wechat")
      .set("wechatpay-signature", "test-sig")
      .send({ id: "wechat-tx-001" });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("SUCCESS");
  });
});

// ── POST /api/payments/:orderNo/mock-paid ──
describe("集成测试 — POST /api/payments/:orderNo/mock-paid", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createPaymentCtx("mock"); // mock 模式才注册此路由
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).post("/api/payments/PAY-001/mock-paid");
    expect(res.status).toBe(401);
  });

  it("订单不存在 → 404", async () => {
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue(null);

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).post("/api/payments/FAKE/mock-paid").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it("订单不属于当前用户 → 403", async () => {
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue({
      order_no: "PAY-001", user_key: "other@example.com",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).post("/api/payments/PAY-001/mock-paid").set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });

  it("模拟支付成功 → 200", async () => {
    const { fulfillMockPayment } = await import("../../server/payment/fulfillment");
    (fulfillMockPayment as any).mockResolvedValue({ found: true });
    (ctx.payment.paymentsRepo.findByOrderNo as any).mockResolvedValue({
      order_no: "PAY-001", user_key: "test@example.com",
    });

    const app = createTestApp(createPaymentRouter, ctx);
    const res = await supertest(app).post("/api/payments/PAY-001/mock-paid").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("paid");
  });
});
