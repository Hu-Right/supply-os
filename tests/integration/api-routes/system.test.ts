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
  extractTierLabel: vi.fn(),
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
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });

  it("BUILD_ID 环境变量优先于文件读取", async () => {
    vi.stubEnv("BUILD_ID", "build-abc-123");
    const { GET } = await import("@/app/api/system/version/route");
    const res = await GET();
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
      const res = await GET();
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
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bah: "" });
  });

  it("查询成功 → 返回备案号并设置缓存", async () => {
    poolQuery.mockResolvedValue([[{ bah: "京ICP备2026-test号" }]]);
    const { GET } = await import("@/app/api/system/icp/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bah: "京ICP备2026-test号" });
    expect(res.headers.get("Cache-Control")).toContain("max-age=600");
  });

  it("TTL 内再次请求 → 命中缓存（DB 异常也不影响返回）", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/icp/route");
    const res = await GET();
    expect(await res.json()).toMatchObject({ bah: "京ICP备2026-test号" });
    expect(res.headers.get("Cache-Control")).toContain("max-age=600");
  });
});

// ── 测试用例：/api/system/links ───────────────────────────────────────────────

describe("GET /api/system/links", () => {
  it("DB 查询异常 → 降级返回空数组", async () => {
    poolQuery.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/system/links/route");
    const res = await GET();
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
    const res = await GET();
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
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(res.headers.get("Cache-Control")).toContain("max-age=1800");
  });
});

// ── 测试用例：/api/membership/plans ──────────────────────────────────────────

const PLAN_ROWS = [
  { plan_code: "single_99", name: "单篇解锁", price: "99.00", plan_type: "single" },
  { plan_code: "vip_m", name: "VIP 月度", price: "199.00", plan_type: "subscription" },
];

function stubPlansQueries(hasSingleRecord: boolean) {
  poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("crm_membership_plans")) return [PLAN_ROWS];
    if (sql.includes("crm_payment_orders")) return [hasSingleRecord ? [{ "1": 1 }] : []];
    return [[]];
  });
}

describe("GET /api/membership/plans", () => {
  it("未登录 → 返回套餐列表，不附加首单特惠字段", async () => {
    stubPlansQueries(false);
    const { GET } = await import("@/app/api/membership/plans/route");
    const req = new NextRequest("http://localhost:3000/api/membership/plans");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].plan_code).toBe("single_99");
    expect(body[0]).not.toHaveProperty("first_purchase_eligible");
  });

  it("登录 + 无 single 解锁记录 → single_99 附加 first_purchase_eligible=true", async () => {
    stubPlansQueries(false);
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);

    const { GET } = await import("@/app/api/membership/plans/route");
    const req = new NextRequest("http://localhost:3000/api/membership/plans", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    const body = await res.json();
    const single = body.find((p: { plan_code: string }) => p.plan_code === "single_99");
    expect(single.first_purchase_eligible).toBe(true);
    // 其他套餐不附加
    expect(body.find((p: { plan_code: string }) => p.plan_code === "vip_m")).not.toHaveProperty(
      "first_purchase_eligible",
    );
  });

  it("登录 + 已有 single 解锁记录 → first_purchase_eligible=false", async () => {
    stubPlansQueries(true);
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);

    const { GET } = await import("@/app/api/membership/plans/route");
    const req = new NextRequest("http://localhost:3000/api/membership/plans", {
      headers: { authorization: "Bearer valid-token" },
    });
    const body = await (await GET(req)).json();
    expect(body.find((p: { plan_code: string }) => p.plan_code === "single_99").first_purchase_eligible).toBe(false);
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

const MEMBER_STATE = {
  tier: "vip",
  freeQuota: 5,
  freeUsed: 1,
  freeRemaining: 4,
  paidUnlocks: 3,
  paidQuotaTotal: 10,
  paidQuotaUsed: 3,
  paidQuotaRemaining: 7,
  currentBest: { plan_code: "vip_m", plan_name: "VIP 月度", price: "199.00" },
  activeSubscriptions: [],
  entitlements: {},
};

describe("GET /api/membership/status", () => {
  it("未认证 → 401", async () => {
    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("认证 + 有当前套餐 → 返回会员状态与套餐标签", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 101,
    } as never);
    const { resolveMembershipState } = await import("@/lib/services/membership-status");
    vi.mocked(resolveMembershipState).mockResolvedValue(MEMBER_STATE as never);
    const { extractTierLabel } = await import("@/lib/services/membership-upgrade");
    vi.mocked(extractTierLabel).mockReturnValue("月度VIP" as never);

    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      user_id: 101,
      membership_tier: "vip",
      free_remaining: 4,
      paid_quota_remaining: 7,
      current_plan_code: "vip_m",
      current_plan_tier_label: "月度VIP",
      current_plan_price: 199,
    });
    expect(resolveMembershipState).toHaveBeenCalledWith(expect.anything(), 101);
  });

  it("认证 + 无当前套餐 → 套餐字段为 null", async () => {
    const { verifyAccessToken } = await import("@/lib/services/jwt");
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 102,
    } as never);
    const { resolveMembershipState } = await import("@/lib/services/membership-status");
    vi.mocked(resolveMembershipState).mockResolvedValue({
      ...MEMBER_STATE,
      currentBest: null,
    } as never);

    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status", {
      headers: { authorization: "Bearer valid-token" },
    });
    const body = await (await GET(req)).json();
    expect(body.current_plan_code).toBeNull();
    expect(body.current_plan_tier_label).toBeNull();
    expect(body.current_plan_price).toBeNull();
  });
});

// ── 测试用例：/api/catalog/country-name-map ──────────────────────────────────

describe("GET /api/catalog/country-name-map", () => {
  it("返回国家名映射", async () => {
    const { GET } = await import("@/app/api/catalog/country-name-map/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // 响应结构：{ data: { countries: {...}, countryNameZh: {...} } } 或 { countries: {...} }
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });
});
