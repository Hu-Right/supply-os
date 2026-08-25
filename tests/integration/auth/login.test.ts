/**
 * API 集成测试 — 认证域：登录 / 用户信息 / 刷新 / 登出
 * Integration tests for auth/login routes via supertest
 *
 * 覆盖端点：
 *   POST /api/auth/login     — 邮箱/手机登录
 *   GET  /api/auth/user      — 获取用户信息（JWT 认证）
 *   POST /api/auth/refresh   — Token 刷新（Cookie）
 *   POST /api/auth/logout    — 登出
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import {
  createMockContext, createMockRateLimiter, createTestApp,
} from "../helpers";
import type { AppContext } from "../helpers";

// ── Mock 服务模块（vi.mock 会被提升到 import 之前执行）──
vi.mock("../../../server/services/auth", () => ({
  verifyPassword: vi.fn().mockResolvedValue(true),
  needsUpgrade: vi.fn().mockReturnValue(false),
  buildUserResponse: vi.fn().mockResolvedValue({
    user_key: "test@example.com",
    email: "test@example.com",
    display_name: "Test",
    membership_tier: "free",
  }),
  hashPassword: vi.fn().mockResolvedValue("$2b$12$hashed"),
  issueTokenPair: vi.fn().mockResolvedValue({ token: "access-jwt", refresh_token: "refresh-jwt" }),
  hashVerificationCode: vi.fn((code: string) => `hash:${code}`),
}));

vi.mock("../../../server/services/jwt", () => ({
  signAccessToken: vi.fn().mockReturnValue("new-access-jwt"),
  signRefreshToken: vi.fn().mockReturnValue({ token: "new-refresh-jwt", tokenHash: "hash:new-refresh" }),
  verifyRefreshToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  hashRefreshToken: vi.fn().mockReturnValue("hash:refresh"),
  getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date("2099-01-01")),
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

vi.mock("../../../server/utils/auth-cookies", () => ({
  setRefreshCookie: vi.fn(),
  clearRefreshCookie: vi.fn(),
  readRefreshCookie: vi.fn().mockReturnValue(""),
}));

import { createLoginRouter } from "../../../server/routes/auth/login.routes";

function mountLoginRouter(ctx: AppContext) {
  const loginLimiter = createMockRateLimiter();
  const accountLimiter = createMockRateLimiter();
  return createLoginRouter(ctx, loginLimiter, accountLimiter);
}

describe("集成测试 — POST /api/auth/login", () => {
  let request: supertest.Agent;
  let ctx: AppContext;

  beforeAll(() => {
    ctx = createMockContext({
      usersRepo: {
        findAuthByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com",
          email: "test@example.com",
          password_hash: "$2b$12$validhash",
          password_hash_type: "bcrypt",
          account_status: "active",
          display_name: "Test User",
          phone: null,
          phone_verified: false,
        }),
        findByPhone: vi.fn().mockResolvedValue(null),
      },
    });
    const app = createTestApp(mountLoginRouter, ctx);
    request = supertest.agent(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("正确邮箱+密码 → 200 登录成功", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toHaveProperty("user_key", "test@example.com");
  });

  it("空邮箱 → 401（mock findAuthByKey 对空串返回 null）", async () => {
    // 空邮箱时 identifier=""，findAuthByKey("") 被调用
    // 真实 DB 中不会有 user_key="" 的用户，mock 需要对空串返回 null
    (ctx.user.usersRepo.findAuthByKey as any).mockResolvedValueOnce(null);
    const res = await request
      .post("/api/auth/login")
      .send({ email: "", password: "Test1234!" });
    expect(res.status).toBe(401);
  });

  it("空密码 → verifyPassword 返回 false → 401", async () => {
    // 需要 mock verifyPassword 对空密码返回 false
    const { verifyPassword } = await import("../../../server/services/auth");
    (verifyPassword as any).mockResolvedValueOnce(false);
    const res = await request
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "" });
    expect(res.status).toBe(401);
  });
});

describe("集成测试 — POST /api/auth/login 用户不存在", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext({
      usersRepo: {
        findAuthByKey: vi.fn().mockResolvedValue(null),
        findByPhone: vi.fn().mockResolvedValue(null),
      },
    });
    const app = createTestApp(mountLoginRouter, ctx);
    request = supertest.agent(app);
  });

  it("不存在的用户 → 401", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Test1234!" });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("账号或密码错误");
  });
});

describe("集成测试 — POST /api/auth/login 账号禁用", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext({
      usersRepo: {
        findAuthByKey: vi.fn().mockResolvedValue({
          user_key: "disabled@example.com",
          email: "disabled@example.com",
          password_hash: "$2b$12$validhash",
          password_hash_type: "bcrypt",
          account_status: "disabled",
        }),
        findByPhone: vi.fn().mockResolvedValue(null),
      },
    });
    const app = createTestApp(mountLoginRouter, ctx);
    request = supertest.agent(app);
  });

  it("禁用账号 → 403", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email: "disabled@example.com", password: "Test1234!" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("停用");
  });
});

describe("集成测试 — GET /api/auth/user", () => {
  it("无 JWT → 400 请先登录", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountLoginRouter, ctx);
    const res = await supertest(app).get("/api/auth/user");
    expect(res.status).toBe(400);
  });

  it("有 mock JWT → 200 返回用户信息", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findProfileByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com",
          email: "test@example.com",
        }),
      },
    });
    const app = createTestApp(mountLoginRouter, ctx);
    const res = await supertest(app)
      .get("/api/auth/user")
      .set("Authorization", "Bearer mock-jwt-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("集成测试 — POST /api/auth/logout", () => {
  it("登出 → 200 success", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountLoginRouter, ctx);
    const res = await supertest(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
