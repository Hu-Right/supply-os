/**
 * API 集成测试 — 供应商域：列表 / 联系方式 / 注册 / 认领
 * Integration tests for supplier routes via supertest
 *
 * 覆盖端点：
 *   GET  /api/suppliers          — 供应商列表（公开）
 *   GET  /api/suppliers/:id/contact — 联系方式（VIP only）
 *   POST /api/suppliers          — 注册供应商（需 JWT）
 *   POST /api/supplier-claims    — 供应商认领（需 JWT）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express from "express";
import { createMockContext, createMockRateLimiter } from "./helpers";
import { notFoundHandler, errorHandler } from "../../server/middleware/errorHandler";
import { optionalAuth } from "../../server/middleware/auth";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock 供应商列表依赖的服务 ──
vi.mock("../../server/services/translation/chain", () => ({
  translateViaChain: vi.fn(),
}));

vi.mock("../../server/services/suppliers", () => ({
  mapSupplierRow: vi.fn((row: any) => ({ id: row.id, name: row.name })),
}));

vi.mock("../../server/services/membership-status", () => ({
  resolveMembershipState: vi.fn(),
}));

vi.mock("../../server/services/leads", () => ({
  insertUngmAppointment: vi.fn().mockResolvedValue(undefined),
}));

import { createSupplierListRouter } from "../../server/routes/suppliers/list";
import { createSupplierContactRouter } from "../../server/routes/suppliers/contact";
import { createSupplierRegisterRouter } from "../../server/routes/suppliers/register";

// ── 辅助：构建 mini app ──
function buildApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(optionalAuth);
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// ── GET /api/suppliers ──
describe("集成测试 — GET /api/suppliers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("→ 200 供应商列表（全量模式）", async () => {
    const directoryRepo = {
      listDirectory: vi.fn().mockResolvedValue([
        { id: 1, name: "Supplier A" },
        { id: 2, name: "Supplier B" },
      ]),
      listDirectoryPaginated: vi.fn(),
      findContact: vi.fn(),
    };
    const registrationRepo = {
      listTranslations: vi.fn().mockResolvedValue([]),
      findCrmByRequestHash: vi.fn(),
      insertCrmSupplier: vi.fn(),
      findCrmById: vi.fn(),
      findCrmIdByCompanyName: vi.fn(),
      upsertTranslation: vi.fn(),
    };
    const cache = new Map();
    const router = createSupplierListRouter({
      directoryRepo: directoryRepo as any,
      registrationRepo: registrationRepo as any,
      cache,
      cacheTtl: 300_000,
      invalidateCache: () => cache.clear(),
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("分页模式 → 200", async () => {
    const directoryRepo = {
      listDirectory: vi.fn(),
      listDirectoryPaginated: vi.fn().mockResolvedValue({
        items: [{ id: 1, name: "Supplier A" }],
        total: 10,
      }),
      findContact: vi.fn(),
    };
    const registrationRepo = {
      listTranslations: vi.fn().mockResolvedValue([]),
      findCrmByRequestHash: vi.fn(),
      insertCrmSupplier: vi.fn(),
      findCrmById: vi.fn(),
      findCrmIdByCompanyName: vi.fn(),
      upsertTranslation: vi.fn(),
    };
    const cache = new Map();
    const router = createSupplierListRouter({
      directoryRepo: directoryRepo as any,
      registrationRepo: registrationRepo as any,
      cache,
      cacheTtl: 300_000,
      invalidateCache: () => cache.clear(),
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers?page=1&pageSize=9");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(10);
  });
});

// ── GET /api/suppliers/:id/contact ──
describe("集成测试 — GET /api/suppliers/:id/contact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 JWT → 401", async () => {
    const ctx = createMockContext();
    const router = createSupplierContactRouter({
      directoryRepo: ctx.supplier.directoryRepo,
      usersRepo: ctx.user.usersRepo,
      membershipRepo: ctx.user.membershipRepo,
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers/1/contact");
    expect(res.status).toBe(401);
  });

  it("非 VIP → 403", async () => {
    const { resolveMembershipState } = await import("../../server/services/membership-status");
    (resolveMembershipState as any).mockResolvedValue({ isVip: false });

    const ctx = createMockContext({
      usersRepo: { findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }) },
    });
    const router = createSupplierContactRouter({
      directoryRepo: ctx.supplier.directoryRepo,
      usersRepo: ctx.user.usersRepo,
      membershipRepo: ctx.user.membershipRepo,
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers/1/contact").set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });

  it("VIP + 供应商存在 → 200 联系方式", async () => {
    const { resolveMembershipState } = await import("../../server/services/membership-status");
    (resolveMembershipState as any).mockResolvedValue({ isVip: true });

    const ctx = createMockContext({
      usersRepo: { findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }) },
      directoryRepo: {
        findContact: vi.fn().mockResolvedValue({
          contact: "John", phone: "123456", email: "john@example.com",
        }),
      },
    });
    const router = createSupplierContactRouter({
      directoryRepo: ctx.supplier.directoryRepo,
      usersRepo: ctx.user.usersRepo,
      membershipRepo: ctx.user.membershipRepo,
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers/1/contact").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.contactPerson).toBe("John");
    expect(res.body.contactPhone).toBe("123456");
  });

  it("供应商不存在 → 404", async () => {
    const { resolveMembershipState } = await import("../../server/services/membership-status");
    (resolveMembershipState as any).mockResolvedValue({ isVip: true });

    const ctx = createMockContext({
      usersRepo: { findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }) },
      directoryRepo: { findContact: vi.fn().mockResolvedValue(null) },
    });
    const router = createSupplierContactRouter({
      directoryRepo: ctx.supplier.directoryRepo,
      usersRepo: ctx.user.usersRepo,
      membershipRepo: ctx.user.membershipRepo,
    });
    const app = buildApp(router);
    const res = await supertest(app).get("/api/suppliers/999/contact").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/suppliers ──
describe("集成测试 — POST /api/suppliers（注册）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 JWT → 401", async () => {
    const ctx = createMockContext();
    const router = createSupplierRegisterRouter({
      registrationRepo: ctx.supplier.registrationRepo,
      claimRepo: ctx.supplier.claimRepo,
      usersRepo: ctx.user.usersRepo,
      leadsRepo: ctx.leadsRepo,
      invalidateCache: vi.fn(),
    });
    const app = buildApp(router);
    const res = await supertest(app).post("/api/suppliers").send({});
    expect(res.status).toBe(401);
  });

  it("缺少必填字段 → 400", async () => {
    const ctx = createMockContext();
    const router = createSupplierRegisterRouter({
      registrationRepo: ctx.supplier.registrationRepo,
      claimRepo: ctx.supplier.claimRepo,
      usersRepo: ctx.user.usersRepo,
      leadsRepo: ctx.leadsRepo,
      invalidateCache: vi.fn(),
    });
    const app = buildApp(router);
    const res = await supertest(app)
      .post("/api/suppliers")
      .set(AUTH_HEADER)
      .send({ nameZh: "", contactPerson: "" });
    expect(res.status).toBe(400);
  });

  it("有效注册 → 201", async () => {
    const ctx = createMockContext({
      registrationRepo: {
        findCrmByRequestHash: vi.fn().mockResolvedValue({
          id: 1, name: "Test Co", industry: "Tech",
        }),
        insertCrmSupplier: vi.fn(),
        findCrmById: vi.fn(),
        findCrmIdByCompanyName: vi.fn(),
        listTranslations: vi.fn(),
        upsertTranslation: vi.fn(),
      },
    });
    const router = createSupplierRegisterRouter({
      registrationRepo: ctx.supplier.registrationRepo,
      claimRepo: ctx.supplier.claimRepo,
      usersRepo: ctx.user.usersRepo,
      leadsRepo: ctx.leadsRepo,
      invalidateCache: vi.fn(),
    });
    const app = buildApp(router);
    const res = await supertest(app)
      .post("/api/suppliers")
      .set(AUTH_HEADER)
      .send({
        nameZh: "Test Co",
        contactPerson: "John",
        contactEmail: "john@test.com",
        type: "domestic",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("supplier");
  });
});

// ── POST /api/supplier-claims ──
describe("集成测试 — POST /api/supplier-claims（认领）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 JWT → 401", async () => {
    const ctx = createMockContext();
    const router = createSupplierRegisterRouter({
      registrationRepo: ctx.supplier.registrationRepo,
      claimRepo: ctx.supplier.claimRepo,
      usersRepo: ctx.user.usersRepo,
      leadsRepo: ctx.leadsRepo,
      invalidateCache: vi.fn(),
    });
    const app = buildApp(router);
    const res = await supertest(app).post("/api/supplier-claims").send({});
    expect(res.status).toBe(401);
  });

  it("有效认领 → 201", async () => {
    const ctx = createMockContext({
      registrationRepo: {
        findCrmIdByCompanyName: vi.fn().mockResolvedValue(1),
        findCrmByRequestHash: vi.fn(),
        insertCrmSupplier: vi.fn(),
        findCrmById: vi.fn(),
        listTranslations: vi.fn(),
        upsertTranslation: vi.fn(),
      },
      claimRepo: { insertClaim: vi.fn().mockResolvedValue(42) },
    });
    const router = createSupplierRegisterRouter({
      registrationRepo: ctx.supplier.registrationRepo,
      claimRepo: ctx.supplier.claimRepo,
      usersRepo: ctx.user.usersRepo,
      leadsRepo: ctx.leadsRepo,
      invalidateCache: vi.fn(),
    });
    const app = buildApp(router);
    const res = await supertest(app)
      .post("/api/supplier-claims")
      .set(AUTH_HEADER)
      .send({ company_name: "Test Co", supplier_type: "domestic" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(42);
    expect(res.body.status).toBe("pending");
  });
});
