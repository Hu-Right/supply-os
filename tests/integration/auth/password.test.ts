/**
 * API 集成测试 — 认证域：密码找回 / 重置
 * Integration tests for auth/password routes via supertest
 *
 * 覆盖端点：
 *   POST /api/auth/check-email-phone — 检查邮箱是否绑定手机号
 *   POST /api/auth/forgot-password   — 发送找回密码验证码
 *   POST /api/auth/reset-password    — 重置密码
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
  buildUserResponse: vi.fn().mockResolvedValue({
    user_key: "test@example.com", display_name: "Test", membership_tier: "free",
  }),
  issueTokenPair: vi.fn().mockResolvedValue({ token: "jwt", refresh_token: "refresh" }),
}));

vi.mock("../../../server/services/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../server/services/sms", () => ({
  sendSmsVerificationCode: vi.fn().mockResolvedValue(undefined),
  isSmsConfigured: vi.fn().mockReturnValue(true),
  getSmsResetTemplateCode: vi.fn().mockReturnValue("SMS_RESET"),
}));

vi.mock("../../../server/utils/auth-cookies", () => ({
  setRefreshCookie: vi.fn(),
}));

import { createPasswordRouter } from "../../../server/routes/auth/password.routes";

function mountPasswordRouter(ctx: AppContext) {
  const forgotLimiter = createMockRateLimiter();
  const phoneSmsLimiter = createMockRateLimiter();
  return createPasswordRouter(ctx, forgotLimiter, phoneSmsLimiter);
}

describe("集成测试 — POST /api/auth/check-email-phone", () => {
  it("有绑定手机 → has_phone=true", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ phone: "13800138000", phone_verified: true }),
      },
    });
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/check-email-phone")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.has_phone).toBe(true);
  });

  it("无绑定手机 → has_phone=false", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ phone: null, phone_verified: false }),
      },
    });
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/check-email-phone")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.has_phone).toBe(false);
  });

  it("无效邮箱 → 400", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/check-email-phone")
      .send({ email: "bad" });
    expect(res.status).toBe(400);
  });
});

describe("集成测试 — POST /api/auth/forgot-password", () => {
  it("邮箱渠道 → 200 发送成功", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }),
      },
      authRepo: {
        invalidateUnusedCodes: vi.fn(),
        createResetCode: vi.fn().mockResolvedValue(1),
        markEmailSent: vi.fn(),
      },
    });
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "test@example.com", channel: "email" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("无效邮箱 → 400", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "bad", channel: "email" });
    expect(res.status).toBe(400);
  });
});

describe("集成测试 — POST /api/auth/reset-password", () => {
  it("有效验证码+新密码 → 200 重置成功", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }),
        findAuthByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com", email: "test@example.com",
        }),
        updatePassword: vi.fn(),
        markEmailVerified: vi.fn(),
      },
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({
          id: 1, code: "hash:123456", attempts: 0,
        }),
        deleteRefreshTokensByUser: vi.fn(),
        markCodeUsed: vi.fn(),
      },
    });
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ email: "test@example.com", code: "123456", new_password: "NewTest1234!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("缺少字段 → 400", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({});
    expect(res.status).toBe(400);
  });

  it("密码过弱 → 400", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPasswordRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ email: "test@example.com", code: "123456", new_password: "123" });
    expect(res.status).toBe(400);
  });
});
