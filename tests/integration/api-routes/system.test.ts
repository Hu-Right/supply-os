/**
 * API Route Handler 集成测试示例
 * Integration test examples for API Route Handlers
 *
 * @description 演示如何对 src/app/api 下的关键接口编写集成测试。
 *              Mock DB Pool，不连接真实数据库。
 *              真实 DB 交互由 E2E 测试（Playwright）覆盖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock 基础设施 ─────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    execute: vi.fn().mockResolvedValue([[]]),
    query: vi.fn().mockResolvedValue([[]]),
    getConnection: vi.fn().mockResolvedValue({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: vi.fn().mockResolvedValue([[]]),
    }),
  }),
}));

vi.mock("@/lib/services/jwt", () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  signRefreshToken: vi.fn().mockReturnValue({ token: "mock-refresh-token", tokenHash: "mock-hash" }),
}));

// ── 测试用例：/api/system/version ────────────────────────────────────────────

describe("GET /api/system/version", () => {
  it("返回版本号（无需认证）", async () => {
    const { GET } = await import("@/app/api/system/version/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("version");
  });
});

// ── 测试用例：/api/membership/status ─────────────────────────────────────────

describe("GET /api/membership/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未认证 → 返回 401 或错误响应", async () => {
    const { GET } = await import("@/app/api/membership/status/route");
    const req = new NextRequest("http://localhost:3000/api/membership/status");
    const res = await GET(req);
    // 未携带 JWT → 应返回 401 或业务错误码
    expect([401, 400]).toContain(res.status);
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
