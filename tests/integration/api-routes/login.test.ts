/**
 * POST /api/auth/login 集成测试
 *
 * @description 覆盖登录路由全部分支：参数校验、双维度限流、
 *              用户查找、密码验证、账号状态、哈希升级、token 签发与降级。
 *              Mock DB Pool 与 auth 服务层（服务内部逻辑由单测覆盖）；
 *              rateLimiter / extractClientIp / cookie 工具走真实实现。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/services/auth", () => ({
  verifyPassword: vi.fn(),
  needsUpgrade: vi.fn(),
  buildUserResponse: vi.fn(),
  hashPassword: vi.fn(),
  issueTokenPair: vi.fn(),
}));

const AUTH_USER_ROW = {
  user_key: "user-1",
  email: "user-1@test.com",
  phone: null,
  phone_verified: 0,
  display_name: "测试用户",
  password_hash: "$2b$12$hashedpassword",
  password_hash_type: "bcrypt",
  email_verified: 1,
  membership_tier: "free",
  account_status: "active",
  supplier_id: null,
  supplier_link_status: null,
};

function loginReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callLogin(body: unknown) {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(loginReq(body));
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue([[]]);
  poolExecute.mockResolvedValue([[]]);
});

afterEach(() => {
  // 清理限流共享 Map，避免用例间计数泄漏
  (globalThis as unknown as { _rlMap?: Map<string, unknown> })._rlMap = undefined;
});

describe("POST /api/auth/login", () => {
  it("缺少 identifier → 400", async () => {
    const { verifyPassword } = await import("@/lib/services/auth");
    const res = await callLogin({ password: "any" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 40011 });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("用户不存在 → 恒时密码验证后返回 401（防时序攻击）", async () => {
    const { verifyPassword } = await import("@/lib/services/auth");
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await callLogin({ identifier: "ghost@test.com", password: "pw" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 40042 });
    // 恒时验证：使用固定 dummy hash + bcrypt（密码为用户实际输入）
    expect(verifyPassword).toHaveBeenCalledWith("pw", expect.stringContaining("$2b$12$"), "bcrypt");
  });

  it("密码错误 → 401", async () => {
    const { verifyPassword } = await import("@/lib/services/auth");
    vi.mocked(verifyPassword).mockResolvedValue(false);
    poolQuery.mockResolvedValue([[AUTH_USER_ROW]]);

    const res = await callLogin({ identifier: "user-1@test.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 40042 });
  });

  it("账号停用 → 403", async () => {
    const { verifyPassword } = await import("@/lib/services/auth");
    vi.mocked(verifyPassword).mockResolvedValue(true);
    poolQuery.mockResolvedValue([[{ ...AUTH_USER_ROW, account_status: "disabled" }]]);

    const res = await callLogin({ identifier: "user-1@test.com", password: "pw" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 40003 });
  });

  it("sha256 旧哈希 → 升级为 bcrypt 后签发 token 并设置 Refresh Cookie", async () => {
    const { verifyPassword, needsUpgrade, hashPassword, buildUserResponse, issueTokenPair } =
      await import("@/lib/services/auth");
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(needsUpgrade).mockReturnValue(true);
    vi.mocked(hashPassword).mockResolvedValue("$2b$12$newhash");
    vi.mocked(buildUserResponse).mockResolvedValue({ user_key: "user-1" } as never);
    vi.mocked(issueTokenPair).mockResolvedValue({ token: "atk-123", refresh_token: "rtk-456" });
    poolQuery.mockResolvedValue([[{ ...AUTH_USER_ROW, password_hash_type: "sha256" }]]);

    const res = await callLogin({ identifier: "user-1@test.com", password: "pw" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, token: "atk-123" });
    // 哈希升级入库（repo 层参数顺序：newHash, hashType, userKey）
    expect(poolExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE crm_users"),
      ["$2b$12$newhash", "bcrypt", "user-1"],
    );
    // Refresh Cookie 设置（真实 cookie 工具）
    expect(res.headers.get("set-cookie")).toContain("supply_os_refresh_token=rtk-456");
  });

  it("issueTokenPair 抛错 → 静默降级，返回 200 但无 token 无 Cookie", async () => {
    const { verifyPassword, needsUpgrade, buildUserResponse, issueTokenPair } =
      await import("@/lib/services/auth");
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(needsUpgrade).mockReturnValue(false);
    vi.mocked(buildUserResponse).mockResolvedValue({ user_key: "user-1" } as never);
    vi.mocked(issueTokenPair).mockRejectedValue(new Error("JWT_SECRET_NOT_CONFIGURED"));
    poolQuery.mockResolvedValue([[AUTH_USER_ROW]]);

    const res = await callLogin({ identifier: "user-1@test.com", password: "pw" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.token).toBeUndefined();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("同账号超限（预置计数）→ 429 + Retry-After", async () => {
    // 预置账号维度限流计数（maxAttempts=10）
    (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })._rlMap =
      new Map([["login-acct:user-1@test.com", { count: 10, resetAt: Date.now() + 60_000 }]]);

    const res = await callLogin({ identifier: "user-1@test.com", password: "pw" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe(42001);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("同 IP 超限（预置计数）→ 429", async () => {
    // 无 XFF 头 → extractClientIp 返回 127.0.0.1；IP 维度 maxAttempts=30
    (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })._rlMap =
      new Map([["login-ip:127.0.0.1", { count: 30, resetAt: Date.now() + 60_000 }]]);

    const res = await callLogin({ identifier: "someone@test.com", password: "pw" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe(42001);
  });
});
