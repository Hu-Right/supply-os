import { describe, it, expect, vi, beforeAll } from "vitest";
import { hashPasswordLegacy, hashVerificationCode, needsUpgrade, verifyPassword, hashPassword } from "./auth";
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
  vi.mock("./jwt", () => ({
    signAccessToken: vi.fn(() => "mock-access-token"),
    signRefreshToken: vi.fn(() => ({ token: "mock-refresh-token", tokenHash: "mock-hash" })),
    getRefreshTokenExpiresAt: vi.fn(() => new Date("2099-01-01")),
  }));

  it("返回 token + refresh_token", async () => {
    const { issueTokenPair } = await import("./auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockResolvedValue(undefined),
    };
    const result = await issueTokenPair(mockAuthRepo as any, "user@test.com", "user@test.com");
    expect(result.token).toBe("mock-access-token");
    expect(result.refresh_token).toBe("mock-refresh-token");
  });

  it("insertRefreshToken 失败不阻断", async () => {
    const { issueTokenPair } = await import("./auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const result = await issueTokenPair(mockAuthRepo as any, "user@test.com", "user@test.com");
    expect(result.token).toBe("mock-access-token");
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
    const { buildUserResponse } = await import("./auth");
    const user = {
      user_key: "user@test.com",
      email: "user@test.com",
      display_name: "Test User",
      account_status: "active",
      phone: "13800138000",
      phone_verified: 1,
      email_verified: 1,
    };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.user_key).toBe("user@test.com");
    expect(result.email).toBe("user@test.com");
    expect(result.membership_tier).toBe("free");
    expect(result.phone).toBeTruthy();
    expect(result.phone_verified).toBe(1);
  });

  it("无手机号 → phone=null", async () => {
    const { buildUserResponse } = await import("./auth");
    const user = { user_key: "user@test.com" };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.phone).toBeNull();
  });
});
