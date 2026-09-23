/**
 * API Route Handler 集成测试
 * Integration tests for API Route Handlers
 *
 * @description 覆盖 system / membership 域的公开与认证接口。
 *              Mock DB Pool（可按 SQL 分流），不连接真实数据库。
 *              真实 DB 交互由 E2E 测试（Playwright）覆盖。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// ── Mock 基础设施 ─────────────────────────────────────────────────────────────
// hoisted：vi.mock 工厂被提升到文件顶部，需通过 vi.hoisted 共享可控 mock 实例，
// 供各用例按 SQL 片段分流返回不同结果集。
const { poolQuery, poolExecute } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    execute: poolExecute,
    query: poolQuery,
    getConnection: vi.fn().mockResolvedValue({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: poolExecute,
    }),
  }),
}));

vi.mock("@/lib/services/jwt", () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  signRefreshToken: vi.fn().mockReturnValue({ token: "mock-refresh-token", tokenHash: "mock-hash" }),
}));

// status / upgrade-preview 路由动态 import 的业务服务（服务内部逻辑由单测覆盖）
vi.mock("@/lib/services/membership-status", () => ({
  resolveMembershipState: vi.fn(),
}));
vi.mock("@/lib/services/membership-upgrade", () => ({
  previewUpgrade: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // 默认空结果集（mysql2 返回 [rows, fields]）
  poolQuery.mockResolvedValue([[]]);
  poolExecute.mockResolvedValue([[]]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── 测试用例：/api/system/version ────────────────────────────────────────────

describe("GET /api/system/version", () => {
  it("返回版本号（无需认证）", async () => {
    const { GET } = await import("@/app/api/system/version/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });

  it("BUILD_ID 环境变量优先于文件读取", async () => {
    vi.stubEnv("BUILD_ID", "build-abc-123");
    const { GET } = await import("@/app/api/system/version/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    const body = await res.json();
    expect(body.version).toBe("build-abc-123");
  });

  it("无 BUILD_ID 时回退读取 dist/version.json", async () => {
    vi.stubEnv("BUILD_ID", "");
    const versionFile = path.join(process.cwd(), "dist", "version.json");
    const existed = fs.existsSync(versionFile);
    if (!existed) {
      fs.mkdirSync(path.dirname(versionFile), { recursive: true });
      fs.writeFileSync(versionFile, JSON.stringify({ version: "9.9.9-test" }), "utf-8");
    }
    try {
      const { GET } = await import("@/app/api/system/version/route");
      const res = await GET(new NextRequest("http://localhost/api/test"));
      const body = await res.json();
      expect(body.version).toBe("9.9.9-test");
    } finally {
      if (!existed) fs.rmSync(versionFile);
    }
  });
});

// ── 测试用例：/api/system/icp ─────────────────────────────────────────────────
// 路由带模块级 10min 缓存：用例顺序即状态机（异常 → 建缓存 → 命中缓存）。

describe("GET /api/system/icp", () => {
  it("DB 查询异常 → 降级返回空 bah", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/icp/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bah: "" });
  });

  it("查询成功 → 返回备案号并设置缓存", async () => {
    poolQuery.mockResolvedValue([[{ bah: "京ICP备2026-test号" }]]);
    const { GET } = await import("@/app/api/system/icp/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bah: "京ICP备2026-test号" });
    expect(res.headers.get("Cache-Control")).toContain("max-age=600");
  });

  it("TTL 内再次请求 → 命中缓存（DB 异常也不影响返回）", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/icp/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(await res.json()).toMatchObject({ bah: "京ICP备2026-test号" });
    expect(res.headers.get("Cache-Control")).toContain("max-age=600");
  });
});

// ── 测试用例：/api/system/links ───────────────────────────────────────────────

describe("GET /api/system/links", () => {
  it("DB 查询异常 → 降级返回空数组", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/links/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("查询成功 → 字段规范化（Number/String 强转）", async () => {
    poolQuery.mockResolvedValue([
      [
        { id: 1, name: "微信", url: "https://weixin.qq.com", icon: "wechat" },
        { id: "2", name: null, url: undefined, icon: 7 },
      ],
    ]);
    const { GET } = await import("@/app/api/system/links/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    const body = await res.json();
    expect(body).toEqual([
      { id: 1, name: "微信", url: "https://weixin.qq.com", icon: "wechat" },
      { id: 2, name: "", url: "", icon: "7" },
    ]);
    expect(res.headers.get("Cache-Control")).toContain("max-age=1800");
  });

  it("TTL 内再次请求 → 命中缓存", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/links/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(res.headers.get("Cache-Control")).toContain("max-age=1800");
  });
});

// ── 测试用例：/api/membership/plans ──────────────────────────────────────────
// 新契约：路由原样透传服务端组装的 ComparisonTable { plans, rows }（免费档不进官网六卡）。

const PLAN_CATALOG_ROWS = [
  { plan_code: "personal_std_999", name_en: "STD", name_zh: "个人标准版", positioning_zh: "标准", price: "999.00", price_mode: "fixed", price_incl_tax: "999.00", currency: "CNY", billing_period_days: 365, seat_limit: 1, commercial_tier: "L3", cta_i18n_key: "cta_std", badge: "none", sort_order: 2, is_active: 1 },
  { plan_code: "enterprise_8800", name_en: "ENT", name_zh: "企业年度会员", positioning_zh: "企业", price: "8800.00", price_mode: "fixed", price_incl_tax: "8800.00", currency: "CNY", billing_period_days: 365, seat_limit: 5, commercial_tier: "L6", cta_i18n_key: "cta_ent", badge: "best_value", sort_order: 5, is_active: 1 },
];
const BENEFIT_DEF_ROWS = [
  { benefit_code: "notice_view", name_zh: "标讯解锁额度", group_code: "core", value_kind: "quota", level_dict: null, is_consumable: 1, requires_subscription: 1, gate_key: null, sort_order: 1 },
];
const MATRIX_CELL_ROWS = [
  { plan_code: "personal_std_999", benefit_code: "notice_view", value_level: null, value_num: 100, value_amount: null, note_zh: "100 条" },
  { plan_code: "enterprise_8800", benefit_code: "notice_view", value_level: null, value_num: -1, value_amount: null, note_zh: "不限" },
];

describe("GET /api/membership/plans", () => {
  it("返回服务端 ComparisonTable（plans + rows 逐格解析），免费档不进六卡", async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("crm_plan_benefits")) return [MATRIX_CELL_ROWS];
      if (sql.includes("crm_benefit_catalog")) return [BENEFIT_DEF_ROWS];
      if (sql.includes("crm_plan_catalog")) return [PLAN_CATALOG_ROWS];
      return [[]];
    });
    const { GET } = await import("@/app/api/membership/plans/route");
    const req = new NextRequest("http://localhost:3000/api/membership/plans");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toHaveLength(2);
    expect(body.plans[0].plan_code).toBe("personal_std_999");
    // quota 行：正数额度按原值展示，-1 展示「不限」且视为享有
    const row = body.rows.find((r: { benefit: { benefit_code: string } }) => r.benefit.benefit_code === "notice_view");
    expect(row.cells["personal_std_999"].display).toBe("100");
    expect(row.cells["enterprise_8800"].display).toBe("不限");
    expect(row.cells["enterprise_8800"].enabled).toBe(true);
  });
});

// ── 测试用例：/api/membership/upgrade/preview ────────────────────────────────

describe("GET /api/membership/upgrade/preview", () => {
  it("未登录 → 401", async () => {
    const { GET } = await import("@/app/api/membership/upgrade/preview/route");
    const req = new NextRequest("http://localhost:3000/api/membership/upgrade/preview");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("缺 target_plan_code → 400 业务错误码", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);

    const { GET } = await import("@/app/api/membership/upgrade/preview/route");
    const req = new NextRequest("http://localhost:3000/api/membership/upgrade/preview", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 40000 });
  });

  it("合法请求 → 返回升级预览结果", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);
    const { previewUpgrade } = await import("@/lib/services/membership-upgrade");
    vi.mocked(previewUpgrade).mockResolvedValue({
      code: 0,
      data: { target_plan_code: "vip_y", deduct_amount: 99 },
    } as never);

    const { GET } = await import("@/app/api/membership/upgrade/preview/route");
    const req = new NextRequest(
      "http://localhost:3000/api/membership/upgrade/preview?target_plan_code=vip_y",
      { headers: { authorization: "Bearer valid-token" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 0, data: { target_plan_code: "vip_y" } });
    expect(previewUpgrade).toHaveBeenCalledWith(expect.anything(), 101, "vip_y");
  });
});

// ── 测试用例：/api/membership/status ─────────────────────────────────────────
// 新契约：resolveMembershipState 返回 { plan, subscription, quotas }，路由原样透传。

const PRO_PLAN = { plan_code: "personal_pro_1299", name_en: "PRO", name_zh: "个人专业版", positioning_zh: "专业", price: "1299.00", price_mode: "fixed", price_incl_tax: "1299.00", currency: "CNY", billing_period_days: 365, seat_limit: 1, commercial_tier: "L4", cta_i18n_key: "cta_pro", badge: "most_popular", sort_order: 4, is_active: 1 };
const FREE_PLAN = { plan_code: "free", name_en: "FREE", name_zh: "普通用户", positioning_zh: "免费", price: "0.00", price_mode: "free", price_incl_tax: "0.00", currency: "CNY", billing_period_days: 0, seat_limit: 1, commercial_tier: "L1", cta_i18n_key: "cta_free", badge: "none", sort_order: 0, is_active: 0 };
const ACTIVE_SUB = { subscription_id: 51, owner_user_id: 101, plan_code: "personal_pro_1299", seat_limit: 1, expires_at: new Date("2030-01-01"), seat_role: "owner", sort_order: 4, started_at: new Date("2026-01-01"), source_order_no: "SO_TEST_1", price_paid: "1299.00", currency: "CNY", status: "active" };
const QUOTA_BALANCES = [
  { benefit_code: "notice_view", scope: "subscription", quota_total: 10, quota_used: 3, status: "active", period: "none", period_starts_at: new Date("2026-01-01"), remaining: 7 },
];

describe("GET /api/membership/status", () => {
  it("未认证 → 401", async () => {
    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("认证 + 有当前套餐 → 返回 {plan, subscription, quotas}", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);
    const { resolveMembershipState } = await import("@/lib/services/membership-status");
    vi.mocked(resolveMembershipState).mockResolvedValue({
      plan: PRO_PLAN,
      subscription: ACTIVE_SUB,
      quotas: QUOTA_BALANCES,
    } as never);

    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.plan_code).toBe("personal_pro_1299");
    expect(body.subscription.plan_code).toBe("personal_pro_1299");
    expect(body.quotas[0].remaining).toBe(7);
    expect(resolveMembershipState).toHaveBeenCalledWith(expect.anything(), 101, true);
  });

  it("认证 + 无当前套餐 → 回落 free 基线、subscription 为 null", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 102,
    } as never);
    const { resolveMembershipState } = await import("@/lib/services/membership-status");
    vi.mocked(resolveMembershipState).mockResolvedValue({
      plan: FREE_PLAN,
      subscription: null,
      quotas: [],
    } as never);

    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status", {
      headers: { authorization: "Bearer valid-token" },
    });
    const body = await (await GET(req)).json();
    expect(body.subscription).toBeNull();
    expect(body.plan.plan_code).toBe("free");
    expect(body.quotas).toEqual([]);
  });
});

// ── 测试用例：/api/catalog/country-name-map ──────────────────────────────────

describe("GET /api/catalog/country-name-map", () => {
  it("返回国家名映射", async () => {
    const { GET } = await import("@/app/api/catalog/country-name-map/route");
    const res = await GET(new NextRequest("http://localhost/api/test"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // 响应结构：{ data: { countries: {...}, countryNameZh: {...} } } 或 { countries: {...} }
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });
});
