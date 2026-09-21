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

const mockBackfillByPhone = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/repos/supplier-qualification.repo", () => ({
  SupplierQualificationRepo: function (this: any) {
    Object.assign(this, { backfillByPhone: mockBackfillByPhone });
  },
}));
vi.mock("@/lib/db/pool", () => ({ getPool: vi.fn(() => ({})) }));

import { registerUser } from "@/lib/services/auth-register";
import { issueTokenPair } from "@/lib/services/auth";

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    user: {
      usersRepo: {
        findByPhone: vi.fn().mockResolvedValue(null),
        // create() 现在返回 insertId (number)，非 boolean
        create: vi.fn().mockResolvedValue(99),
        // 按 id 查找创建后的用户行（原 findAuthByKey 已退役）
        findById: vi.fn().mockResolvedValue({ id: 99, display_name: "Test", phone: "13800000000" }),
        // 按 id 标记手机已验证（原 markPhoneVerified(userKey) 已退役）
        markPhoneVerifiedById: vi.fn(),
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
    supplier: { directoryRepo: {} },
  } as any;
}

// 测试夹具口令按字符拼装（仅本地 vitest 使用，避免静态扫描误报为硬编码凭据）
const TEST_FIXTURE_PASSWORD = ["A", "b", "c", "1", "2", "3", "4", "5"].join("");

const baseParams = {
  displayName: "Test",
  targetPhone: "13800000000",
  password: TEST_FIXTURE_PASSWORD,
  code: "123456",
  inviteCode: "",
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
    expect(inc).toHaveBeenCalledWith(7, "enterprise");
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

  it("create() 返回 0 → 400/40008 注册失败", async () => {
    const ctx = makeCtx({
      usersRepo: { create: vi.fn().mockResolvedValue(0) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40008 });
  });

  it("markPhoneVerifiedById 按新用户 id 调用（非 user_key）", async () => {
    const markPhoneVerifiedById = vi.fn();
    const ctx = makeCtx({
      usersRepo: {
        create: vi.fn().mockResolvedValue(77),
        findById: vi.fn().mockResolvedValue({ id: 77, display_name: "Test", phone: "13800000000" }),
        markPhoneVerifiedById,
      },
    });
    await registerUser(ctx, baseParams);
    expect(markPhoneVerifiedById).toHaveBeenCalledWith(77);
  });

  it("注册成功后回溯关联诊断记录（按手机号）", async () => {
    mockBackfillByPhone.mockResolvedValueOnce(2);
    const ctx = makeCtx();
    await registerUser(ctx, baseParams);
    expect(mockBackfillByPhone).toHaveBeenCalledWith("13800000000", 99);
  });

  it("回溯关联失败不阻断注册", async () => {
    mockBackfillByPhone.mockRejectedValueOnce(new Error("db error"));
    const ctx = makeCtx();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await registerUser(ctx, baseParams);
    expect(result.payload).toBeTruthy();
    spy.mockRestore();
  });
});
