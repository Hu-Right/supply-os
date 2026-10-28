import { describe, it, expect, vi, beforeAll } from "vitest";
import { hashVerificationCode, verifyPassword, hashPassword, generateNickname } from "@/lib/services/auth";
import crypto from "crypto";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";
});

describe("hashVerificationCode", () => {
  it("带 verify_code: 前缀的 SHA-256", () => {
    const hash = hashVerificationCode("123456");
    const expected = crypto.createHash("sha256").update("verify_code:123456").digest("hex");
    expect(hash).toBe(expected);
  });
});

describe("verifyPassword", () => {
  it("bcrypt 哈希 → 正确验证", async () => {
    const hashed = await hashPassword("test1234");
    expect(await verifyPassword("test1234", hashed)).toBe(true);
    expect(await verifyPassword("wrong", hashed)).toBe(false);
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

  it("返回 token + refreshToken（仅传 userId，无 user_key 参数）", async () => {
    const { issueTokenPair } = await import("@/lib/services/auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockResolvedValue(undefined),
    };
    const result = await issueTokenPair(mockAuthRepo as any, 42);
    expect(result.token).toBe("mock-access-token");
    expect(result.refreshToken).toBe("mock-refresh-token");
  });

  it("insertRefreshToken 失败 → 错误仅记日志，token 仍正常返回", async () => {
    const { issueTokenPair } = await import("@/lib/services/auth");
    const mockAuthRepo = {
      insertRefreshToken: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await issueTokenPair(mockAuthRepo as any, 42);
    expect(result.token).toBe("mock-access-token");
    expect(result.refreshToken).toBe("mock-refresh-token");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
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
    findActivePlanForUser: vi.fn().mockResolvedValue(null),
    getPlan: vi.fn(async (code: string) => ({
      plan_code: code, name_zh: code, price: "0", currency: "CNY",
      price_mode: code === "free" ? "free" : "fixed", is_active: 1,
    })),
    listQuotaBalances: vi.fn().mockResolvedValue([]),
  };
  const mockSupplierRepo = {
    findAuthInfoById: vi.fn().mockResolvedValue(null),
  };

  it("基础用户 → 返回完整响应体", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = {
      id: 1,
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
    expect(result.hasSubscription).toBe(false);
    expect(result.phone).toBeTruthy();
    expect(result.phoneVerified).toBe(1);
  });

  it("有昵称 → 输出 nickname，且响应体不含 display_name（隐私收口验收断言）", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = {
      id: 2,
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
    const user = { id: 3, display_name: "李大明", nickname: null };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.nickname).toBe("李**");
    expect(result).not.toHaveProperty("display_name");
  });

  it("无手机号 → phone=null", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = { id: 4, email: "user@test.com" };
    const result = await buildUserResponse(user, mockMembershipRepo as any, mockSupplierRepo as any);
    expect(result.phone).toBeNull();
  });

  // 命名红线②：这个对象是 login/register/profile/reset-password/user 五个出口共用的响应体，
  // 而路由写的是 `json({ user: payload })`——门禁规则一只看路由那个字面量（只有 user 一键），
  // 永不可见本对象的键。所以键集合只能在这里钉：新增列名、或回到 snake 都会当场红。
  it("响应体键集合定形：全部 camelCase，一个 snake 键都不允许上网", async () => {
    const { buildUserResponse } = await import("@/lib/services/auth");
    const user = {
      id: 5,
      email: "u@test.com",
      display_name: "王大名",
      nickname: "采友_ABC",
      account_status: "active",
      phone: "13900139000",
      phone_verified: 1,
      email_verified: 0,
      supplier_id: 77,
      supplier_link_status: "verified",
    };
    mockSupplierRepo.findAuthInfoById.mockResolvedValueOnce({ id: 77 });
    const result = await buildUserResponse(user as any, mockMembershipRepo as any, mockSupplierRepo as any);

    // 键集合直接比列举（此处相邻键要么前缀包含、要么同位置同小写，码点序与字典直觉一致）
    expect(Object.keys(result).sort()).toEqual([
      "accountStatus",
      "email",
      "emailVerified",
      "hasSubscription",
      "id",
      "nickname",
      "phone",
      "phoneVerified",
      "supplierId",
      "supplierIndustry",
      "supplierIndustryId",
    ]);
    // 双重固闸：即使有人绕过上面的列举，“带下划线的键”也必须为零
    expect(Object.keys(result).filter((k) => k.includes("_"))).toEqual([]);
    // 值口径不变：改名不改语义（supplierId 取自关联行、两个退役字段仍恒为 null）
    expect(result.supplierId).toBe(77);
    expect(result.supplierIndustryId).toBeNull();
    expect(result.supplierIndustry).toBeNull();
    expect(result.accountStatus).toBe("active");
    expect(result.emailVerified).toBe(0);
  });
});
