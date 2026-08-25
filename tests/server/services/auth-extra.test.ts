/**
 * server/services/auth.ts 补充测试（异步函数 + buildUserResponse）
 */
import { describe, it, expect, vi } from "vitest";
import { hashPassword, issueTokenPair, buildUserResponse } from "../../../server/services/auth";

// Mock jwt 模块
vi.mock("../../../server/services/jwt", () => ({
  signAccessToken: vi.fn(() => "mock-access-token"),
  signRefreshToken: vi.fn(() => ({ token: "mock-refresh-token", tokenHash: "mock-hash" })),
  getRefreshTokenExpiresAt: vi.fn(() => "2099-01-01T00:00:00Z"),
}));

// Mock membership-status
vi.mock("../../../server/services/membership-status", () => ({
  resolveMembershipState: vi.fn(async () => ({ tier: "vip", daysRemaining: 365, hasSubscription: true })),
}));

describe("hashPassword", () => {
  it("返回 bcrypt 哈希字符串", async () => {
    const hash = await hashPassword("test-password");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it("不同调用产生不同哈希（盐值不同）", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("issueTokenPair", () => {
  it("返回 token 和 refresh_token", async () => {
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockResolvedValue(undefined),
    } as any;

    const result = await issueTokenPair(mockAuthRepo, "user-123", "test@example.com");
    expect(result.token).toBe("mock-access-token");
    expect(result.refresh_token).toBe("mock-refresh-token");
  });

  it("refresh token 入库失败不阻断", async () => {
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockRejectedValue(new Error("DB error")),
    } as any;

    // 不应抛出
    const result = await issueTokenPair(mockAuthRepo, "user-123", "test@example.com");
    expect(result.token).toBe("mock-access-token");
  });
});

describe("buildUserResponse", () => {
  it("组装基本用户响应", async () => {
    const user = {
      user_key: "uk-1",
      email: "a@b.com",
      display_name: "Test",
      account_status: "active",
      phone: "13800138000",
      phone_verified: 1,
      supplier_id: undefined,
      supplier_link_status: undefined,
    };
    const membershipRepo = {} as any;
    const registrationRepo = {} as any;

    const res = await buildUserResponse(user, membershipRepo, registrationRepo);
    expect(res.user_key).toBe("uk-1");
    expect(res.email).toBe("a@b.com");
    expect(res.membership_tier).toBe("vip");
    expect(res.phone).toBeTruthy();
    expect(res.phone_verified).toBe(1);
    expect(res.supplier_id).toBeNull();
  });

  it("supplier_id 存在且 verified 时查询供应商信息", async () => {
    const user = {
      user_key: "uk-2",
      email: "c@d.com",
      supplier_id: 42,
      supplier_link_status: "verified",
    };
    const membershipRepo = {} as any;
    const registrationRepo = {
      findBasicInfo: vi.fn().mockResolvedValue({
        id: 42, industry_id: 5, industry: "Manufacturing",
      }),
    } as any;

    const res = await buildUserResponse(user, membershipRepo, registrationRepo);
    expect(res.supplier_id).toBe(42);
    expect(res.supplier_industry).toBe("Manufacturing");
    expect(registrationRepo.findBasicInfo).toHaveBeenCalledWith(42);
  });

  it("supplier_id 存在但未 verified 时不查询", async () => {
    const user = {
      user_key: "uk-3",
      email: "e@f.com",
      supplier_id: 99,
      supplier_link_status: "pending",
    };
    const membershipRepo = {} as any;
    const registrationRepo = {
      findBasicInfo: vi.fn(),
    } as any;

    const res = await buildUserResponse(user, membershipRepo, registrationRepo);
    expect(res.supplier_id).toBeNull();
    expect(registrationRepo.findBasicInfo).not.toHaveBeenCalled();
  });

  it("无手机号时 phone 为 null", async () => {
    const user = { user_key: "uk-4" };
    const res = await buildUserResponse(user, {} as any, {} as any);
    expect(res.phone).toBeNull();
  });
});
