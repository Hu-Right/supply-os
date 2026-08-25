/**
 * API 集成测试 — 认证域：注册
 * Integration tests for auth/register routes via supertest
 *
 * 覆盖端点：
 *   POST /api/auth/send-register-code — 发送注册验证码
 *   POST /api/auth/register           — 注册
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import supertest from "supertest";
import {
  createMockContext, createMockRateLimiter, createTestApp,
} from "../helpers";
import type { AppContext } from "../helpers";

vi.mock("../../../server/services/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("$2b$12$hashed"),
  hashVerificationCode: vi.fn((code: string) => `hash:${code}`),
  issueTokenPair: vi.fn().mockResolvedValue({ token: "access-jwt", refresh_token: "refresh-jwt" }),
}));

vi.mock("../../../server/services/email", () => ({
  sendRegistrationVerifyEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../server/utils/auth-cookies", () => ({
  setRefreshCookie: vi.fn(),
}));

import { createRegisterRouter } from "../../../server/routes/auth/register.routes";

function mountRegisterRouter(ctx: AppContext) {
  const forgotLimiter = createMockRateLimiter();
  return createRegisterRouter(ctx, forgotLimiter);
}

describe("集成测试 — POST /api/auth/send-register-code", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue(null),
      },
      authRepo: {
        invalidateUnusedCodes: vi.fn(),
        createResetCode: vi.fn().mockResolvedValue(1),
        markEmailSent: vi.fn(),
      },
    });
    const app = createTestApp(mountRegisterRouter, ctx);
    request = supertest.agent(app);
  });

  it("有效邮箱 → 200 验证码已发送", async () => {
    const res = await request
      .post("/api/auth/send-register-code")
      .send({ email: "new@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("无效邮箱格式 → 400", async () => {
    const res = await request
      .post("/api/auth/send-register-code")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("空邮箱 → 400", async () => {
    const res = await request
      .post("/api/auth/send-register-code")
      .send({ email: "" });
    expect(res.status).toBe(400);
  });

  it("已注册邮箱 → 200 防枚举（返回成功但不实际发送）", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "existing@example.com" }),
      },
    });
    const app = createTestApp(mountRegisterRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/send-register-code")
      .send({ email: "existing@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email_sent).toBe(true);
  });
});

describe("集成测试 — POST /api/auth/register", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ user_key: "new@example.com" }),
        markEmailVerified: vi.fn(),
      },
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({
          id: 1,
          code: "hash:123456",
          attempts: 0,
        }),
        markCodeUsed: vi.fn(),
      },
    });
    const app = createTestApp(mountRegisterRouter, ctx);
    request = supertest.agent(app);
  });

  it("有效注册 → 201", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({
        email: "new@example.com",
        password: "Test1234!",
        verify_code: "123456",
        display_name: "New User",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toHaveProperty("user_key", "new@example.com");
  });

  it("缺少验证码 → 400", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "Test1234!" });
    expect(res.status).toBe(400);
  });

  it("密码过弱 → 400", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "123", verify_code: "123456" });
    expect(res.status).toBe(400);
  });

  it("缺少邮箱和密码 → 400", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({});
    expect(res.status).toBe(400);
  });
});
