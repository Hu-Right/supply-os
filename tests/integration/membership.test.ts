/**
 * API 集成测试 — 会员域：套餐 / 状态 / 升级预览
 * Integration tests for membership routes via supertest
 *
 * 覆盖端点：
 *   GET /api/membership/plans            — 套餐列表（公开）
 *   GET /api/membership/status           — 会员状态（需 JWT）
 *   GET /api/membership/upgrade/preview  — 升级预览（需 JWT）
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

// ── Mock 服务模块 ──
vi.mock("../../server/services/membership-upgrade", () => ({
  extractTierLabel: vi.fn((name: string) => name?.includes("VIP") ? "VIP" : "Free"),
  previewUpgrade: vi.fn(),
}));

vi.mock("../../server/services/membership-status", () => ({
  resolveMembershipState: vi.fn(),
}));

import { createMembershipRouter } from "../../server/routes/membership.routes";

// ── GET /api/membership/plans ──
describe("集成测试 — GET /api/membership/plans", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      membershipRepo: {
        findActivePlans: vi.fn().mockResolvedValue([
          { plan_code: "single", plan_type: "single", price: 9.99, plan_name: "Single Unlock" },
          { plan_code: "vip_monthly", plan_type: "subscription", price: 29.99, plan_name: "VIP Monthly" },
        ]),
      },
    });
  });

  it("→ 200 套餐列表（无需登录）", async () => {
    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app).get("/api/membership/plans");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].plan_code).toBe("single");
    expect(res.headers["cache-control"]).toContain("no-store");
  });
});

// ── GET /api/membership/status ──
describe("集成测试 — GET /api/membership/status", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app).get("/api/membership/status");
    expect(res.status).toBe(401);
  });

  it("有 JWT → 200 会员状态", async () => {
    const { resolveMembershipState } = await import("../../server/services/membership-status");
    (resolveMembershipState as any).mockResolvedValue({
      tier: "free",
      freeQuota: 5, freeUsed: 2, freeRemaining: 3,
      paidUnlocks: 0, paidQuotaTotal: 0, paidQuotaUsed: 0, paidQuotaRemaining: 0,
      isVip: false,
      currentBest: null,
      activeSubscriptions: [],
      entitlements: [],
    });

    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app).get("/api/membership/status").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.user_key).toBe("test@example.com");
    expect(res.body.membership_tier).toBe("free");
    expect(res.body.free_quota).toBe(5);
    expect(res.body.free_remaining).toBe(3);
  });
});

// ── GET /api/membership/upgrade/preview ──
describe("集成测试 — GET /api/membership/upgrade/preview", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app).get("/api/membership/upgrade/preview?target_plan_code=vip_monthly");
    expect(res.status).toBe(401);
  });

  it("缺少 target_plan_code → 400", async () => {
    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app).get("/api/membership/upgrade/preview").set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it("有效目标 → 200 升级预览", async () => {
    const { previewUpgrade } = await import("../../server/services/membership-upgrade");
    (previewUpgrade as any).mockResolvedValue({
      target_plan_code: "vip_monthly",
      price_diff: 29.99,
      current_tier: "free",
      target_tier: "vip",
    });

    const app = createTestApp(createMembershipRouter, ctx);
    const res = await supertest(app)
      .get("/api/membership/upgrade/preview?target_plan_code=vip_monthly")
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.target_plan_code).toBe("vip_monthly");
    expect(res.body.price_diff).toBe(29.99);
  });
});
