/**
 * API 集成测试 — 认证域：手机号管理
 * Integration tests for auth/phone routes via supertest
 *
 * 覆盖端点：
 *   POST /api/auth/send-phone-code — 发送手机验证码
 *   POST /api/auth/bind-phone     — 绑定手机
 *   POST /api/auth/rebind-phone   — 换绑手机
 *   POST /api/auth/unbind-phone   — 解绑手机
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import supertest from "supertest";
import {
  createMockContext, createMockRateLimiter, createTestApp,
} from "../helpers";
import type { AppContext } from "../helpers";

vi.mock("../../../server/services/auth", () => ({
  hashVerificationCode: vi.fn((code: string) => `hash:${code}`),
}));

vi.mock("../../../server/services/sms", () => ({
  sendSmsVerificationCode: vi.fn().mockResolvedValue(undefined),
  isSmsConfigured: vi.fn().mockReturnValue(true),
  getSmsResetTemplateCode: vi.fn().mockReturnValue("SMS_RESET"),
}));

vi.mock("../../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

import { createPhoneRouter } from "../../../server/routes/auth/phone.routes";

function mountPhoneRouter(ctx: AppContext) {
  const forgotLimiter = createMockRateLimiter();
  const phoneSmsLimiter = createMockRateLimiter();
  return createPhoneRouter(ctx, forgotLimiter, phoneSmsLimiter);
}

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

describe("集成测试 — POST /api/auth/send-phone-code", () => {
  it("无 JWT → 401", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/send-phone-code")
      .send({ phone: "13800138000", scene: "bind" });
    expect(res.status).toBe(401);
  });

  it("有效请求 → 200 发送成功", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com", phone: null,
        }),
      },
      authRepo: {
        createResetCode: vi.fn().mockResolvedValue(1),
        markSmsSent: vi.fn(),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/send-phone-code")
      .set(AUTH_HEADER)
      .send({ phone: "13800138000", scene: "bind" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("无效 scene → 400", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com" }),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/send-phone-code")
      .set(AUTH_HEADER)
      .send({ phone: "13800138000", scene: "invalid" });
    expect(res.status).toBe(400);
  });
});

describe("集成测试 — POST /api/auth/bind-phone", () => {
  it("有效绑定 → 200", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com", phone: null }),
        findByPhone: vi.fn().mockResolvedValue(null),
        bindPhoneIfUnbound: vi.fn().mockResolvedValue(true),
      },
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({
          id: 1, code: "hash:123456", attempts: 0,
        }),
        markCodeUsed: vi.fn(),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/bind-phone")
      .set(AUTH_HEADER)
      .send({ phone: "13800138000", code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("无 JWT → 401", async () => {
    const ctx = createMockContext();
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/bind-phone")
      .send({ phone: "13800138000", code: "123456" });
    expect(res.status).toBe(401);
  });

  it("无效手机号 → 400", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({ user_key: "test@example.com", phone: null }),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/bind-phone")
      .set(AUTH_HEADER)
      .send({ phone: "123", code: "123456" });
    expect(res.status).toBe(400);
  });
});

describe("集成测试 — POST /api/auth/unbind-phone", () => {
  it("有效解绑 → 200", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com", phone: "13800138000",
        }),
        unbindPhone: vi.fn(),
      },
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({
          id: 1, code: "hash:123456", attempts: 0,
        }),
        markCodeUsed: vi.fn(),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/unbind-phone")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("未绑定手机 → 400", async () => {
    const ctx = createMockContext({
      usersRepo: {
        findByKey: vi.fn().mockResolvedValue({
          user_key: "test@example.com", phone: null,
        }),
      },
    });
    const app = createTestApp(mountPhoneRouter, ctx);
    const res = await supertest(app)
      .post("/api/auth/unbind-phone")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
  });
});
