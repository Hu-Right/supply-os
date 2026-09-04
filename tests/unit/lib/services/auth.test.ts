import { describe, it, expect, vi, beforeAll } from "vitest";
import { hashPasswordLegacy, hashVerificationCode, needsUpgrade, verifyPassword, hashPassword, generateNickname } from "@/lib/services/auth";
import crypto from "crypto";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";
});

describe("hashPasswordLegacy", () => {
  it("SHA-256 哈希输出", () => {
    const hash = hashPasswordLegacy("password123");
    const expected = crypto.createHash("sha256").update("password123").digest("hex");
    expect(hash).toBe(expected);
  });
});

describe("hashVerificationCode", () => {
  it("带 verify_code: 前缀的 SHA-256", () => {
    const hash = hashVerificationCode("123456");
    const expected = crypto.createHash("sha256").update("verify_code:123456").digest("hex");
    expect(hash).toBe(expected);
  });
});

describe("needsUpgrade", () => {
  it("非 bcrypt → 需要升级", () => {
    expect(needsUpgrade("sha256")).toBe(true);
  });
  it("bcrypt → 无需升级", () => {
    expect(needsUpgrade("bcrypt")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("bcrypt 类型 → 正确验证", async () => {
    const hashed = await hashPassword("test1234");
    expect(await verifyPassword("test1234", hashed, "bcrypt")).toBe(true);
    expect(await verifyPassword("wrong", hashed, "bcrypt")).toBe(false);
  });

  it("sha256 类型 → 兼容验证", async () => {
    const hashed = hashPasswordLegacy("mypassword");
    expect(await verifyPassword("mypassword", hashed, "sha256")).toBe(true);
    expect(await verifyPassword("wrong", hashed, "sha256")).toBe(false);
  });
});

describe("hashPassword", () => {
  it("输出 bcrypt 哈希（$2b$ 前缀）", async () => {
    const hashed = await hashPassword("test1234");
    expect(hashed).toMatch(/^\$2[aby]\$/);
  });
});

describe("issueTokenPair", () => {
  // Mock jwt 模块以避免 JWT_SECRET 时序问题
  vi.mock("@/lib/services/jwt", () => ({
    signAccessToken: vi.fn(() => "mock-access-token"),
    signRefreshToken: vi.fn(() => ({ token: "mock-refresh-token", tokenHash: "mock-hash" })),
    getRefreshTokenExpiresAt: vi.fn(() => new Date("2099-01-01")),
  }));

  it("返回 token + refresh_token", async () => {
    const { issueTokenPair } = await import("@/lib/services/auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockResolvedValue(undefined),
    };
    const result = await issueTokenPair(mockAuthRepo as any, 42, "user@test.com");
    expect(result.token).toBe("mock-access-token");
    expect(result.refresh_token).toBe("mock-refresh-token");
  });

  it("insertRefreshToken 失败 → 错误传播（确保 token 入库才返回）", async () => {
    const { issueTokenPair } = await import("@/lib/services/auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    await expect(issueTokenPair(mockAuthRepo as any, 42, "user@test.com"))
      .rejects.toThrow("DB error");
  });
});

describe("generateNickname", () => {
  it("格式：语言前缀 + _ + 4 位随机字符（去除易混淆字符）", () => {
    expect(generateNickname()).toMatch(/^采友_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("zh")).toMatch(/^采友_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("en")).toMatch(/^Buyer_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("es")).toMatch(/^Comprador_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("fr")).toMatch(/^Acheteur_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("ru")).toMatch(/^Закупщик_[A-HJKMNP-Z2-9]{4}$/);
    expect(generateNickname("ar")).toMatch(/^مشتري_[A-HJKMNP-Z2-9]{4}$/);
  });

  it("未知/缺省语言回退中文前缀", () => {
    expect(generateNickname("xx")).toMatch(/^采友_/);
    expect(generateNickname(undefined)).toMatch(/^采友_/);
  });

  it("随机性：多次生成不重复", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateNickname()));
    expect(set.size).toBeGreaterThan(1);
  });
});

describe("buildUserResponse", () => {
  const mockMembershipRepo = {
    getFreeQuota: vi.fn().mockResolvedValue(5),
    countFreeUnlocks: vi.fn().mockResolvedValue(0),
    findActiveSubscriptions: vi.fn().mockResolvedValue([]),
    countPaidUnlocks: vi.fn().mockResolvedValue(0),
    findActiveEntitlements: vi.fn().mockResolvedValue([]),
    findCurrentBestPlan: vi.fn().mockResolvedValue(null),
  };
  const mockSupplierRepo = {
    findBasicInfo: vi.fn().mockResolvedValue(null),
  };

  it("基础用户 → 返回完整响应体", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = {
      id: 1,
      user_key: "user@test.com",
      email: "user@test.com",
      display_name: "Test User",
      account_status: "active",
      phone: "13800138000",
      phone_verified: 1,
      email_verified: 1,
    };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.id).toBe(1);
    expect(result.email).toBe("user@test.com");
    expect(result.membership_tier).toBe("free");
    expect(result.phone).toBeTruthy();
    expect(result.phone_verified).toBe(1);
  });

  it("有昵称 → 输出 nickname，且响应体不含 display_name（隐私收口验收断言）", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = {
      user_key: "13800138000",
      email: "u@test.com",
      display_name: "李大明",
      nickname: "采友_K7X2",
    };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.nickname).toBe("采友_K7X2");
    expect(result).not.toHaveProperty("display_name");
    expect(JSON.stringify(result)).not.toContain("李大明");
  });

  it("回填窗口期兜底：无昵称 → 姓名掩码临时展示", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = { user_key: "13800138000", display_name: "李大明", nickname: null };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.nickname).toBe("李**");
    expect(result).not.toHaveProperty("display_name");
  });

  it("无手机号 → phone=null", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = { user_key: "user@test.com" };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.phone).toBeNull();
  });
});
