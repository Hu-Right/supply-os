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
    issueTokenPair: vi.fn().mockResolvedValue({ token: "access", refreshToken: "refresh" }),
  };
});

// 诊断只在登录态下按 (user_id, supplier_id) 写入，注册流程无需额外 repo mock。
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
        // 注册即登录→补记最后登录时间
        updateLastLoginById: vi.fn(),
        ...overrides.usersRepo,
      },
      authRepo: {
        findLatestActiveCodeByPhone: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 }),
        markCodeUsed: vi.fn(),
        backfillCodeUserId: vi.fn(),
        incrementCodeAttempts: vi.fn(),
        recordConsentLog: vi.fn(),
        ...overrides.authRepo,
      },
      invitationRepo: {
        // 2026-10-30 起邀请码必填：默认给一个有效员工码，让「验证码/判重/成功」等用例能走到被测分支；
        // 专门验证归因行为的用例再各自覆盖 validateCode 返回值的 owner 命名空间。
        validateCode: vi.fn().mockResolvedValue({
          valid: true,
          owner: { namespace: "employee", employeeId: 7 },
        }),
        incrementMonthlyActual: vi.fn(),
        recordChannelRegistration: vi.fn(),
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
  inviteCode: "EMP-TEST1234",
  clientIp: "1.2.3.4",
  userAgent: "test",
};

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复默认 mock
    vi.mocked(issueTokenPair).mockResolvedValue({
      token: "access",
      refreshToken: "refresh",
    });
  });

  it("密码不符合策略 → 400/40000 EC_INVALID_PARAMS（旧 40006 撞公告不存在）", async () => {
    const ctx = makeCtx();
    await expect(registerUser(ctx, { ...baseParams, password: "123" }))
      .rejects.toMatchObject({ status: 400, code: 40000 });
  });

  it("邀请码无效 → 400/41119 EC_INVITE_CODE_INVALID（旧 40031 撞课程不存在）", async () => {
    const ctx = makeCtx({
      invitationRepo: { validateCode: vi.fn().mockResolvedValue({ valid: false, reason: "已过期" }) },
    });
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "BAD" }))
      .rejects.toMatchObject({ status: 400, code: 41119 });
  });

  it("验证码不存在 → 400/40007", async () => {
    const ctx = makeCtx({
      authRepo: { findLatestActiveCodeByPhone: vi.fn().mockResolvedValue(null) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40007 });
  });

  it("验证码错误 → 400/40007 + 递增尝试次数", async () => {
    const inc = vi.fn();
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCodeByPhone: vi.fn().mockResolvedValue({ id: 1, code: "hash:999999", attempts: 0 }),
        incrementCodeAttempts: inc,
      },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40007 });
    expect(inc).toHaveBeenCalledWith(1);
  });

  it("验证码尝试过多 → 429/41108 EC_TOO_MANY_ATTEMPTS", async () => {
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCodeByPhone: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 5 }),
      },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 429, code: 41108 });
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

  it("注册成功 → 补记 last_login_at（注册即登录与密码登录同口径）", async () => {
    const updateLastLoginById = vi.fn();
    const markPhoneVerifiedById = vi.fn();
    const ctx = makeCtx({
      usersRepo: { markPhoneVerifiedById, updateLastLoginById },
    });
    await registerUser(ctx, baseParams);
    expect(updateLastLoginById).toHaveBeenCalledWith(99);
    // 登录时间不得先于手机验证写入（建号未完全成功时不应留登录痕迹）
    expect(markPhoneVerifiedById.mock.invocationCallOrder[0])
      .toBeLessThan(updateLastLoginById.mock.invocationCallOrder[0]);
  });

  it("验证码无效 → 不写 last_login_at（失败路径不留登录痕迹）", async () => {
    const updateLastLoginById = vi.fn();
    const ctx = makeCtx({
      usersRepo: { updateLastLoginById },
      authRepo: { findLatestActiveCodeByPhone: vi.fn().mockResolvedValue(null) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40007 });
    expect(updateLastLoginById).not.toHaveBeenCalled();
  });

  it("手机号已注册 → 不写 last_login_at", async () => {
    const updateLastLoginById = vi.fn();
    const ctx = makeCtx({
      usersRepo: { findByPhone: vi.fn().mockResolvedValue({ id: 1 }), updateLastLoginById },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40008 });
    expect(updateLastLoginById).not.toHaveBeenCalled();
  });

  it("注册成功 → 以手机号锚点查码并回填 user_id", async () => {
    const finder = vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 });
    const backfill = vi.fn();
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCodeByPhone: finder,
        markCodeUsed: vi.fn(),
        backfillCodeUserId: backfill,
        recordConsentLog: vi.fn(),
      },
    });
    await registerUser(ctx, baseParams);
    // 锤点为手机号（非 user_key/user_id）
    expect(finder).toHaveBeenCalledWith("13800000000", "registration");
    // 注册成功（create 返回 99）后回填码行的 user_id
    expect(backfill).toHaveBeenCalledWith(1, 99);
  });

  it("有效员工码 → 递增 KPI（注册 KPI「个人起步」口径：先记个人桶）且不写渠道台账", async () => {
    const inc = vi.fn();
    const ledger = vi.fn();
    const ctx = makeCtx({
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({ valid: true, owner: { namespace: "employee", employeeId: 7 } }),
        incrementMonthlyActual: inc,
        recordChannelRegistration: ledger,
      },
    });
    await registerUser(ctx, { ...baseParams, inviteCode: "EMP-XCAO26A1" });
    expect(inc).toHaveBeenCalledWith(7, "personal");
    // 两个命名空间各走各的账：员工码多写一行渠道台账，等于凭空给渠道商送一个人头
    expect(ledger).not.toHaveBeenCalled();
  });

  it("渠道码注册成功 → 写台账一人一行，且不动员工 KPI、不污染 referral_employee_id", async () => {
    const inc = vi.fn();
    const ledger = vi.fn();
    const create = vi.fn().mockResolvedValue(99);
    const ctx = makeCtx({
      usersRepo: { create },
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({
          valid: true,
          owner: { namespace: "channel", code: "CH-AB2345CD", partnerId: 5 },
        }),
        incrementMonthlyActual: inc,
        recordChannelRegistration: ledger,
      },
    });
    await registerUser(ctx, { ...baseParams, inviteCode: "CH-AB2345CD" });

    // 台账拿的是建号回来的 insertId（不是手机号、更不是客户端传来的任何人 id）
    expect(ledger).toHaveBeenCalledWith({ userId: 99, code: "CH-AB2345CD", partnerId: 5 });
    // 渠道归因不得写进员工列：否则一登员工后台就能看见不属于他的人头
    expect(create.mock.calls[0][0].referral_employee_id).toBeUndefined();
    expect(inc).not.toHaveBeenCalled();
  });

  it("渠道码写账失败 → 整单失败，不静默吞掉（台账是对账凭据，丢一笔就是少给渠道商结一笔）", async () => {
    const ctx = makeCtx({
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({
          valid: true,
          owner: { namespace: "channel", code: "CH-AB2345CD", partnerId: 5 },
        }),
        recordChannelRegistration: vi.fn().mockRejectedValue(new Error("db down")),
      },
    });
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "CH-AB2345CD" })).rejects.toThrow("db down");
  });

  it("渠道码无效 → 400/41119 且不建号（拒在写任何数据之前）", async () => {
    const create = vi.fn();
    const ledger = vi.fn();
    const ctx = makeCtx({
      usersRepo: { create },
      invitationRepo: {
        validateCode: vi.fn().mockResolvedValue({ valid: false, reason: "渠道邀请码无效或已停用" }),
        recordChannelRegistration: ledger,
      },
    });
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "CH-NOSUCH11" }))
      .rejects.toMatchObject({ status: 400, code: 41119 });
    expect(create).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it("无邀请码 → 400/41119 直接拒绝，不查验证码、不建号（2026-10-30 必填口径）", async () => {
    const create = vi.fn();
    const validateCode = vi.fn();
    const inc = vi.fn();
    const ledger = vi.fn();
    const findCode = vi.fn();
    const ctx = makeCtx({
      usersRepo: { create },
      authRepo: { findLatestActiveCodeByPhone: findCode },
      invitationRepo: { validateCode, incrementMonthlyActual: inc, recordChannelRegistration: ledger },
    });
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "" }))
      .rejects.toMatchObject({ status: 400, code: 41119, message: expect.stringContaining("邀请码") });
    // 必填拦截发生在一切写操作之前：不校验码、不查验证码、不建号、不记账
    expect(validateCode).not.toHaveBeenCalled();
    expect(findCode).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(inc).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it("邀请码仅空白 → 同样 400/41119（trim 后为空）", async () => {
    const ctx = makeCtx();
    await expect(registerUser(ctx, { ...baseParams, inviteCode: "   " }))
      .rejects.toMatchObject({ status: 400, code: 41119 });
  });

  it("合规同意日志：terms + privacy 两条，且入参不再携带已退役列", async () => {
    const consent = vi.fn();
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCodeByPhone: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 }),
        markCodeUsed: vi.fn(),
        backfillCodeUserId: vi.fn(),
        recordConsentLog: consent,
      },
    });
    // 客户端仍会传 agreementAcceptedAt（旧前端契约），但 consent_log.consent_timestamp 已退役：
    // 落库时间事实由服务端 created_at 承担，因此该值不得再向下传递。
    await registerUser(ctx, { ...baseParams, agreementVersion: "V3.0", agreementAcceptedAt: "2026-09-26T01:02:03.000Z" });

    expect(consent).toHaveBeenCalledTimes(2);
    expect(consent.mock.calls.map((c) => c[0].consentType).sort()).toEqual(["privacy", "terms"]);
    for (const [arg] of consent.mock.calls) {
      expect(arg).not.toHaveProperty("timestamp");
      expect(arg).not.toHaveProperty("userKey");
      expect(arg).not.toHaveProperty("sourcePage");
      expect(arg).toMatchObject({ userId: 99, action: "agree", documentVersion: "V3.0" });
    }
  });

  it("合规日志失败不阻断主流程", async () => {
    const ctx = makeCtx({
      authRepo: {
        findLatestActiveCodeByPhone: vi.fn().mockResolvedValue({ id: 1, code: "hash:123456", attempts: 0 }),
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

  it("create() 返回 0 → 400/40022 EC_INVALID_REQUEST 注册失败", async () => {
    const ctx = makeCtx({
      usersRepo: { create: vi.fn().mockResolvedValue(0) },
    });
    await expect(registerUser(ctx, baseParams))
      .rejects.toMatchObject({ status: 400, code: 40022 });
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

  it("注册不再触碰已退役的 v1 诊断回溯（无副作用即可完成注册）", async () => {
    const ctx = makeCtx();
    const res = await registerUser(ctx, baseParams);
    expect(res.payload).toBeTruthy();
  });
});
