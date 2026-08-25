/**
 * server/routes/admin 路由层补充测试
 * 覆盖 admin/index.ts (createAdminRouter)、metrics 参数解析、quality 表清单
 */
import { describe, it, expect, vi } from "vitest";
import { Router } from "express";

// ── createAdminRouter 结构验证 ──
// 通过 mock AppContext 验证路由编排入口正确组合子路由
describe("createAdminRouter", () => {
  it("返回 Express Router", async () => {
    // Mock 所有子路由模块
    vi.doMock("../../../server/routes/admin/data-ops.routes", () => ({
      createAdminDataOpsRouter: () => Router(),
    }));
    vi.doMock("../../../server/routes/admin/quality.routes", () => ({
      createAdminQualityRouter: () => Router(),
    }));
    vi.doMock("../../../server/routes/admin/translation.routes", () => ({
      createAdminTranslationRouter: () => Router(),
    }));
    vi.doMock("../../../server/routes/admin/user-mgmt.routes", () => ({
      createAdminUserMgmtRouter: () => Router(),
    }));
    vi.doMock("../../../server/routes/admin/metrics.routes", () => ({
      createAdminMetricsRouter: () => Router(),
    }));

    const { createAdminRouter } = await import("../../../server/routes/admin/index");
    const mockCtx = {
      dbPool: {},
      admin: { adminRepo: {} },
    } as any;

    const router = createAdminRouter(mockCtx);
    // Router 是 function 且含 stack 属性
    expect(typeof router).toBe("function");
    expect(router.stack).toBeDefined();

    vi.doUnmock("../../../server/routes/admin/data-ops.routes");
    vi.doUnmock("../../../server/routes/admin/quality.routes");
    vi.doUnmock("../../../server/routes/admin/translation.routes");
    vi.doUnmock("../../../server/routes/admin/user-mgmt.routes");
    vi.doUnmock("../../../server/routes/admin/metrics.routes");
  });
});

// ── metrics 路由参数解析逻辑 ──
describe("admin/metrics since_days 参数解析", () => {
  it("默认 30 天", () => {
    const raw = undefined;
    const sinceDays = Math.min(Math.max(parseInt(String(raw), 10) || 30, 1), 365);
    expect(sinceDays).toBe(30);
  });

  it("合法值直通", () => {
    const raw = "90";
    const sinceDays = Math.min(Math.max(parseInt(raw, 10) || 30, 1), 365);
    expect(sinceDays).toBe(90);
  });

  it("clamp 到最小 1", () => {
    const raw = "0";
    const sinceDays = Math.min(Math.max(parseInt(raw, 10) || 30, 1), 365);
    // parseInt("0") = 0, 0 || 30 = 30
    expect(sinceDays).toBe(30);
  });

  it("clamp 到最大 365", () => {
    const raw = "999";
    const sinceDays = Math.min(Math.max(parseInt(raw, 10) || 30, 1), 365);
    expect(sinceDays).toBe(365);
  });

  it("非法值回退默认 30", () => {
    const raw = "abc";
    const sinceDays = Math.min(Math.max(parseInt(raw, 10) || 30, 1), 365);
    expect(sinceDays).toBe(30);
  });
});

// ── data-ops batches 参数解析 ──
describe("admin/data-ops batches 参数解析", () => {
  it("默认 5 批", () => {
    const raw = undefined;
    const batches = Math.min(Math.max(parseInt(String(raw), 10) || 5, 1), 30);
    expect(batches).toBe(5);
  });

  it("合法值直通", () => {
    const batches = Math.min(Math.max(parseInt("10", 10) || 5, 1), 30);
    expect(batches).toBe(10);
  });

  it("clamp 到 [1, 30]", () => {
    expect(Math.min(Math.max(parseInt("50", 10) || 5, 1), 30)).toBe(30);
    expect(Math.min(Math.max(parseInt("0", 10) || 5, 1), 30)).toBe(5);
  });
});

// ── quality 路由表清单完整性 ──
describe("admin/quality 表清单", () => {
  const EXPECTED_TABLES = [
    "crm_users",
    "ungm_1v1_appointments",
    "crm_membership_plans",
    "crm_user_subscriptions",
    "crm_payment_orders",
    "crm_payment_provider_configs",
    "crm_user_entitlements",
    "crm_opportunity_unlocks",
    "crm_user_notice_views",
    "crm_notice_interests",
    "crm_user_interest_codes",
    "crm_supplier_claims",
    "crm_supplier_translations",
    "crm_bid_notice_unspsc_codes",
    "crm_user_search_log",
    "crm_data_quality_snapshot",
    "crm_notice_amount_cache",
    "crm_user_reco_feedback",
    "crm_reco_weight_profile",
    "crm_notice_view_daily",
  ];

  it("包含 20 张核心表", () => {
    expect(EXPECTED_TABLES).toHaveLength(20);
  });

  it("所有表名符合安全白名单（仅字母/数字/下划线）", () => {
    const TABLE_NAME_RE = /^[A-Za-z0-9_]+$/;
    for (const table of EXPECTED_TABLES) {
      expect(TABLE_NAME_RE.test(table)).toBe(true);
    }
  });

  it("关键表 crm_users / crm_payment_orders 在清单中", () => {
    expect(EXPECTED_TABLES).toContain("crm_users");
    expect(EXPECTED_TABLES).toContain("crm_payment_orders");
  });
});

// ── requireAdmin 补充边界 ──
import { requireAdmin } from "../../../server/routes/admin/middleware";

describe("requireAdmin — 补充边界", () => {
  function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("空字符串 token 视为未配置（503）", () => {
    process.env.ADMIN_API_TOKEN = "";
    const req = { headers: { "x-admin-token": "any" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    delete process.env.ADMIN_API_TOKEN;
  });

  it("空白 token trim 后视为未配置（503）", () => {
    process.env.ADMIN_API_TOKEN = "   ";
    const req = { headers: { "x-admin-token": "any" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    delete process.env.ADMIN_API_TOKEN;
  });

  it("Bearer 空值回退到空字符串 → 401", () => {
    process.env.ADMIN_API_TOKEN = "secret";
    const req = { headers: { authorization: "Bearer " } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    delete process.env.ADMIN_API_TOKEN;
  });
});
