// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createPaymentRouter } from "../../../server/routes/payment.routes";

vi.mock("../../../server/services/notice-translation", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
}));

vi.mock("../../../server/config/env", () => ({
  getPaymentRuntimeConfig: () => ({
    live_enabled: false,
    payment_mode: "mock",
    providers: {
      alipay: { configured: false },
      wechat: { configured: false },
    },
  }),
}));

function createMockCtx(overrides: any = {}) {
  return {
    dbPool: {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn().mockResolvedValue([]),
    },
    paymentService: {
      createOrder: vi.fn().mockResolvedValue({
        order_no: "PAY123",
        provider: "mock",
        pay_url: "/mock-pay",
        qr_code_url: "/mock-qr",
        status: "pending",
      }),
      queryOrder: vi.fn().mockResolvedValue({ order_no: "PAY123", status: "paid" }),
      handleNotify: vi.fn().mockResolvedValue({ success: true }),
    },
    paymentMode: "mock",
    ...overrides,
  };
}

function buildApp(ctx: any) {
  const app = express();
  app.use(express.json());
  app.use(createPaymentRouter(ctx as any));
  return app;
}

// ─── POST /api/billing/subscribe ────────────────────────────────────────────
describe("POST /api/billing/subscribe", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/billing/subscribe").send({ plan_code: "single" });
    expect(res.status).toBe(400);
  });

  it("creates subscription and upgrades to vip", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/billing/subscribe").send({
      user_key: "user@test.com",
      plan_code: "week_21",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.plan_code).toBe("week_21");
    expect(res.body.price).toBe(299);
    expect(res.body.quota).toBe(21);
    expect(res.body.membership_tier).toBe("vip");
    expect(ctx.dbPool.execute).toHaveBeenCalledTimes(2); // insert sub + update tier
  });

  it("defaults to single plan for unknown plan_code", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/billing/subscribe").send({
      user_key: "user@test.com",
      plan_code: "nonexistent",
    });
    expect(res.body.plan_code).toBe("nonexistent");
    expect(res.body.price).toBe(89); // single plan price
  });
});

// ─── POST /api/payment/orders ───────────────────────────────────────────────
describe("POST /api/payment/orders", () => {
  it("creates payment order via paymentService", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payment/orders").send({
      user_key: "user@test.com",
      plan_code: "single",
      provider: "alipay",
    });
    expect(res.status).toBe(201);
    expect(res.body.order_no).toBe("PAY123");
    expect(res.body.payment_mode).toBe("mock");
    expect(ctx.paymentService.createOrder).toHaveBeenCalledTimes(1);
  });

  it("returns 400 on service error", async () => {
    const ctx = createMockCtx();
    ctx.paymentService.createOrder.mockRejectedValue(new Error("Invalid plan"));
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payment/orders").send({
      user_key: "user@test.com",
      plan_code: "",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid plan");
  });
});

// ─── GET /api/payment/orders ────────────────────────────────────────────────
describe("GET /api/payment/orders", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/payment/orders");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("returns paginated order list", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]]) // count
      .mockResolvedValueOnce([[{ // orders
        order_no: "PAY001",
        user_key: "user@test.com",
        provider: "alipay",
        plan_code: "single",
        notice_id: null,
        amount: 89,
        currency: "CNY",
        status: "paid",
        provider_trade_no: "T001",
        paid_at: "2026-01-01",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      }]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/payment/orders?user_key=user@test.com");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].order_no).toBe("PAY001");
    expect(res.body.list[0].notice).toBeNull();
  });

  it("filters by status when provided", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    await request(app).get("/api/payment/orders?user_key=user@test.com&status=paid");
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    expect(countSql).toContain("AND o.status = ?");
  });
});

// ─── GET /api/payment/unlocks ───────────────────────────────────────────────
describe("GET /api/payment/unlocks", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/payment/unlocks");
    expect(res.status).toBe(400);
  });

  it("returns unlock list with notice info", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{
        user_key: "user@test.com",
        notice_id: 5,
        unlock_type: "free",
        price: 0,
        unlocked_at: "2026-01-01",
        external_notice_id: "EXT-001",
        title: "Test Notice",
        notice_type: "Tender",
        country: "Brazil",
        deadline: "2030-01-01",
        deadline_ts: 1893456000,
      }]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/payment/unlocks?user_key=user@test.com");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list[0].notice.title).toBe("Test Notice");
    expect(res.body.list[0].notice.deadline_expired).toBe(false);
  });
});

// ─── GET /api/payment/orders/:orderNo ───────────────────────────────────────
describe("GET /api/payment/orders/:orderNo", () => {
  it("queries order status via paymentService", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).get("/api/payment/orders/PAY123");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
    expect(ctx.paymentService.queryOrder).toHaveBeenCalledWith(
      ctx.dbPool, "PAY123", ""
    );
  });
});

// ─── POST /api/payment/notify/alipay ────────────────────────────────────────
describe("POST /api/payment/notify/alipay", () => {
  it("returns success string on successful notify", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payment/notify/alipay").send({ trade_no: "T1" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("success");
  });

  it("returns fail on error", async () => {
    const ctx = createMockCtx();
    ctx.paymentService.handleNotify.mockRejectedValue(new Error("verify failed"));
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payment/notify/alipay").send({});
    expect(res.text).toBe("fail");
  });
});

// ─── POST /api/payment/notify/wechat ────────────────────────────────────────
describe("POST /api/payment/notify/wechat", () => {
  it("returns SUCCESS code on successful notify", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payment/notify/wechat").send({});
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("SUCCESS");
  });
});

// ─── POST /api/payments/create ──────────────────────────────────────────────
describe("POST /api/payments/create", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/payments/create").send({ plan_code: "single_89" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("returns 404 when plan not found", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]); // no plan
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payments/create").send({
      user_key: "user@test.com",
      plan_code: "invalid_plan",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PLAN_NOT_FOUND");
  });

  it("creates order with mock payment mode", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[{
      plan_code: "single_89",
      name: "单次解锁",
      price: 89,
      currency: "CNY",
    }]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payments/create").send({
      user_key: "user@test.com",
      plan_code: "single_89",
      provider: "alipay",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.order_no).toContain("PAY");
    expect(res.body.amount).toBe(89);
    expect(res.body.payment_mode).toBe("mock");
  });
});

// ─── POST /api/payments/:orderNo/mock-paid ──────────────────────────────────
describe("POST /api/payments/:orderNo/mock-paid", () => {
  it("returns 404 when order not found", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payments/INVALID/mock-paid").send({});
    expect(res.status).toBe(404);
  });

  it("marks order as paid and creates entitlement", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ // order
        order_no: "PAY001",
        user_key: "user@test.com",
        plan_code: "single_89",
        notice_id: null,
        status: "pending",
      }]])
      .mockResolvedValueOnce([[{ // plan
        duration_days: null,
        plan_type: "single",
        unlock_quota: 1,
      }]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payments/PAY001/mock-paid").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("paid");
    // Should update order + insert entitlement
    expect(ctx.dbPool.execute).toHaveBeenCalled();
  });

  it("skips processing for already paid order", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[{
      order_no: "PAY001",
      status: "paid",
      user_key: "user@test.com",
      plan_code: "single_89",
    }]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/payments/PAY001/mock-paid").send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
    // No execute calls for already paid
    expect(ctx.dbPool.execute).not.toHaveBeenCalled();
  });
});

// ─── GET /api/payment/config-status ─────────────────────────────────────────
describe("GET /api/payment/config-status", () => {
  it("returns runtime config and provider status", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]); // no active configs
    const app = buildApp(ctx);
    const res = await request(app).get("/api/payment/config-status");
    expect(res.status).toBe(200);
    expect(res.body.live_enabled).toBe(false);
    expect(res.body.providers).toBeDefined();
    expect(res.body.required_env).toBeDefined();
  });
});
