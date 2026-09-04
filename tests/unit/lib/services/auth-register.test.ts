/**
 * 注册编排服务测试
 * @module tests/unit/lib/services/auth-register.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue("bcrypt-hash"),
    hashVerificationCode: vi.fn((c: string) => `hash:${c}`),
    generateNickname: vi.fn(() => "采友_TEST"),
    buildUserResponse: vi.fn().mockResolvedValue({ id: 99, nickname: "采友_TEST" }),
    issueTokenPair: vi.fn().mockResolvedValue({ token: "access", refresh_token: "refresh" }),
  };
});

import { registerUser } from "@/lib/services/auth-register";
import { issueTokenPair } from "@/lib/services/auth";

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    user: {
      usersRepo: {
        findByPhone: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 99 }),
        findAuthByKey: vi.fn().mockResolvedValue({ id: 99, user_key: "13800000000", display_name: "Test" }),
        markPhoneVerified: vi.fn(),
        ...overrides.usersRepo,
      },
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 }),
        markCodeUsed: vi.fn(),
        incrementCodeAttempts: vi.fn(),
        recordConsentLog: vi.fn(),
        ...overrides.authRepo,
      },
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({ valid: false }),
        incrementMonthlyActual: vi.fn(),
        ...overrides.invitationRepo,
      },
      membershipRepo: {},
    },
    supplier: { registrationRepo: {} },
  } as any;
}

const baseParams = {
  displayName: "Test",
  targetPhone: "13800000000",
  password: "Abc12345",
  code: "123456",
  inviteCode: "",
  userType: "personal" as const,
  clientIp: "1.2.3.4",
  userAgent: "test",
};

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复默认 mock
    vi.mocked(issueTokenPair).mockResolvedValue({
      token: "access",
      refresh_token: "refresh",
    });
  });

  it("密码不符合策略 → 400/40006", async () => {
    const ctx = makeCtx();
    await expect(registerUser(ctx, { ...baseParams, password: "123" }))
      .rejects.toMatchObject({ status: 400, code: 40006 });
  });

  it("邀请码无效 → 400/40031", async () => {
    const ctx = makeCtx({
      invitationRepo: { validateCode: vi.fn().mockResolvedValue({ valid: false, reason: "已过期" }) },
    });
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "BAD" }))
      .rejects.toMatchObject({ status: 400, code: 40031 });
  });

  it("验证码不存在 → 400/40007", async () => {
    const ctx = makeCtx({
      authRepo: { findLatestActiveCode: vi.fn().mockResolvedValue(null) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40007 });
  });

  it("验证码错误 → 400/40007 + 递增尝试次数", async () => {
    const inc = vi.fn();
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({ id: 1, code: "hash:999999", attempts: 0 }),
        incrementCodeAttempts: inc,
      },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40007 });
    expect(inc).toHaveBeenCalledWith(1);
  });

  it("验证码尝试过多 → 429/40029", async () => {
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 5 }),
      },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 429, code: 40029 });
  });

  it("手机号已注册 → 400/40008", async () => {
    const ctx = makeCtx({
      usersRepo: { findByPhone: vi.fn().mockResolvedValue({ id: 1 }) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40008 });
  });

  it("正常注册 → 返回 payload + tokens", async () => {
    const ctx = makeCtx();
    const result = await registerUser(ctx, baseParams);
    expect(result.payload).toBeTruthy();
    expect(result.accessToken).toBe("access");
    expect(result.refreshToken).toBe("refresh");
  });

  it("有效邀请码 → 递增 KPI", async () => {
    const inc = vi.fn();
    const ctx = makeCtx({
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({ valid: true, employee_id: 7 }),
        incrementMonthlyActual: inc,
      },
    });
    await registerUser(ctx, { ...baseParams, inviteCode: "GOOD" });
    expect(inc).toHaveBeenCalledWith(7, "personal");
  });

  it("合规日志失败不阻断主流程", async () => {
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCode: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 }),
        markCodeUsed: vi.fn(),
        recordConsentLog: vi.fn().mockRejectedValue(new Error("db")),
      },
    });
    const result = await registerUser(ctx, baseParams);
    expect(result.payload).toBeTruthy();
  });

  it("JWT 签发失败 → 静默降级（token=null）", async () => {
    vi.mocked(issueTokenPair).mockRejectedValueOnce(new Error("no secret"));
    const ctx = makeCtx();
    const result = await registerUser(ctx, baseParams);
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
  });
});
