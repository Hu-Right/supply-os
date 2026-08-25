/**
 * API 集成测试 — 培训域：报名 / 下载 / 落地页 / 订单
 * Integration tests for training routes via supertest
 *
 * 覆盖端点：
 *   POST /api/training/register              — 研修班报名
 *   POST /api/training/downloads/track       — 下载追踪
 *   GET  /api/training/downloads/stats       — 下载统计
 *   GET  /api/training/landing               — 落地页数据
 *   POST /api/training/orders                — 创建订单（需 JWT）
 *   GET  /api/training/orders/:order_no      — 查询订单（需 JWT）
 *   POST /api/training/orders/:order_no/mock-paid — 模拟支付（mock 模式）
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

// ── Mock 培训支付服务 ──
vi.mock("../../server/services/training-payment", () => ({
  createTrainingOrder: vi.fn(),
  queryTrainingOrderStatus: vi.fn(),
  fulfillTrainingOrder: vi.fn().mockResolvedValue(undefined),
}));

import { createTrainingRouter } from "../../server/routes/training.routes";

/** 创建带完整 trainingRepo mock 的 context */
function createTrainingCtx(overrides?: Record<string, any>) {
  return createMockContext({
    trainingRepo: {
      insertRegistration: vi.fn().mockResolvedValue(1),
      incrementDownloadCount: vi.fn().mockResolvedValue(5),
      listDownloadStats: vi.fn().mockResolvedValue([]),
      getActiveCourse: vi.fn().mockResolvedValue(null),
      listSchedules: vi.fn().mockResolvedValue([]),
      listFeaturedInstructors: vi.fn().mockResolvedValue([]),
      listTeamMembers: vi.fn().mockResolvedValue([]),
      listGalleryCategories: vi.fn().mockResolvedValue([]),
      listGalleryImagesByCategory: vi.fn().mockResolvedValue([]),
      listTestimonials: vi.fn().mockResolvedValue([]),
      listFaqs: vi.fn().mockResolvedValue([]),
      findOrderByNo: vi.fn(),
      saveParticipants: vi.fn(),
      getParticipantsByOrderId: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
    opportunitiesRepo: {
      findUnspscCodeById: vi.fn().mockResolvedValue(null),
      findFullById: vi.fn(),
    },
    paymentMode: "mock",
  });
}

// ── POST /api/training/register ──
describe("集成测试 — POST /api/training/register", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTrainingCtx();
  });

  it("缺少必填字段 → 400", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/register")
      .send({ company_name: "", contact_name: "", telephone: "" });
    expect(res.status).toBe(400);
  });

  it("有效报名 → 201", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/register")
      .send({
        company_name: "Test Corp",
        contact_name: "John",
        telephone: "13800138000",
        email: "john@test.com",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(1);
  });
});

// ── POST /api/training/downloads/track ──
describe("集成测试 — POST /api/training/downloads/track", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTrainingCtx();
  });

  it("缺少 material_id → 400", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/downloads/track")
      .send({ file_name: "test.pdf" });
    expect(res.status).toBe(400);
  });

  it("有效追踪 → 200", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/downloads/track")
      .send({ material_id: "mat-001", file_name: "guide.pdf" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(5);
  });
});

// ── GET /api/training/downloads/stats ──
describe("集成测试 — GET /api/training/downloads/stats", () => {
  it("→ 200 下载统计", async () => {
    const ctx = createTrainingCtx({
      listDownloadStats: vi.fn().mockResolvedValue([
        { material_id: "mat-001", file_name: "guide.pdf", total: 10 },
      ]),
    });
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/downloads/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ── GET /api/training/landing ──
describe("集成测试 — GET /api/training/landing", () => {
  it("→ 200 落地页数据（无课程）", async () => {
    const ctx = createTrainingCtx();
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/landing");
    expect(res.status).toBe(200);
    expect(res.body.course).toBeNull();
    expect(res.body.schedules).toHaveLength(0);
    expect(res.body).toHaveProperty("instructors");
    expect(res.body).toHaveProperty("gallery");
    expect(res.body).toHaveProperty("testimonials");
    expect(res.body).toHaveProperty("faqs");
  });

  it("→ 200 落地页数据（有课程）", async () => {
    const ctx = createTrainingCtx({
      getActiveCourse: vi.fn().mockResolvedValue({
        id: 1, name_zh: "研修班", name_en: "Seminar",
        description_zh: "描述", description_en: "Desc",
        unit_price: 2999, currency: "CNY", includes: '["materials"]',
      }),
      listSchedules: vi.fn().mockResolvedValue([
        { id: 1, period_number: 1, start_date: "2026-09-01", city: "Beijing", format: "offline", status: "open", capacity: 30, enrolled_count: 10 },
      ]),
    });
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/landing");
    expect(res.status).toBe(200);
    expect(res.body.course.name_zh).toBe("研修班");
    expect(res.body.schedules).toHaveLength(1);
  });
});

// ── POST /api/training/orders ──
describe("集成测试 — POST /api/training/orders", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTrainingCtx();
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).post("/api/training/orders").send({});
    expect(res.status).toBe(401);
  });

  it("创建订单成功 → 201", async () => {
    const { createTrainingOrder } = await import("../../server/services/training-payment");
    (createTrainingOrder as any).mockResolvedValue({
      order_no: "TR-001",
      pay_url: "https://pay.example.com",
      qr_code_url: "https://qr.example.com",
    });

    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/orders")
      .set(AUTH_HEADER)
      .send({ course_id: 1, provider: "alipay" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.order_no).toBe("TR-001");
  });

  it("课程不存在 → 404", async () => {
    const { createTrainingOrder } = await import("../../server/services/training-payment");
    (createTrainingOrder as any).mockRejectedValue(new Error("COURSE_NOT_FOUND"));

    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/orders")
      .set(AUTH_HEADER)
      .send({ course_id: 999 });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/training/orders/:order_no ──
describe("集成测试 — GET /api/training/orders/:order_no", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTrainingCtx({
      findOrderByNo: vi.fn().mockResolvedValue({
        order_no: "TR-001", user_key: "test@example.com", status: "paid",
      }),
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/orders/TR-001");
    expect(res.status).toBe(401);
  });

  it("订单不属于当前用户 → 403", async () => {
    (ctx.trainingRepo.findOrderByNo as any).mockResolvedValue({
      order_no: "TR-001", user_key: "other@example.com", status: "paid",
    });
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/orders/TR-001").set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });

  it("查询成功 → 200", async () => {
    const { queryTrainingOrderStatus } = await import("../../server/services/training-payment");
    (queryTrainingOrderStatus as any).mockResolvedValue({
      order_no: "TR-001", status: "paid",
    });

    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).get("/api/training/orders/TR-001").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.order_no).toBe("TR-001");
  });
});

// ── POST /api/training/orders/:order_no/mock-paid ──
describe("集成测试 — POST /api/training/orders/:order_no/mock-paid", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTrainingCtx({
      findOrderByNo: vi.fn().mockResolvedValue({
        order_no: "TR-001", user_key: "test@example.com", status: "pending",
      }),
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app).post("/api/training/orders/TR-001/mock-paid");
    expect(res.status).toBe(401);
  });

  it("模拟支付成功 → 200", async () => {
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/orders/TR-001/mock-paid")
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("paid");
  });

  it("订单不属于当前用户 → 403", async () => {
    (ctx.trainingRepo.findOrderByNo as any).mockResolvedValue({
      order_no: "TR-001", user_key: "other@example.com", status: "pending",
    });
    const app = createTestApp(createTrainingRouter, ctx);
    const res = await supertest(app)
      .post("/api/training/orders/TR-001/mock-paid")
      .set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });
});
