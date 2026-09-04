/**
 * 登录编排服务测试
 * @module tests/unit/lib/services/auth-login.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    verifyPassword: vi.fn(),
    hashPassword: vi.fn().mockResolvedValue("new-bcrypt-hash"),
    buildUserResponse: vi.fn().mockResolvedValue({ id: 1, email: "u@t.com", nickname: "Test" }),
    issueTokenPair: vi.fn().mockResolvedValue({ token: "access", refresh_token: "refresh" }),
  };
});

import { loginWithPassword } from "@/lib/services/auth-login";
import { verifyPassword, issueTokenPair } from "@/lib/services/auth";

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    user: {
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue(null),
        updatePasswordById: vi.fn().mockResolvedValue(undefined),
        ...overrides.usersRepo,
      },
      membershipRepo: {},
      authRepo: { insertRefreshToken: vi.fn() },
    },
    supplier: { registrationRepo: {} },
  } as any;
}

describe("loginWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复默认 mock
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(issueTokenPair).mockResolvedValue({ token: "access", refresh_token: "refresh" });
  });

  it("用户不存在 → 401（恒时验证仍执行）", async () => {
    const ctx = makeCtx();
    await expect(loginWithPassword(ctx, { identifier: "nobody", password: "pw" }))
      .rejects.toMatchObject({ status: 401, code: 40042 });
    expect(verifyPassword).toHaveBeenCalled(); // 恒时验证
  });

  it("密码错误 → 401", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt",
        }),
      },
    });
    await expect(loginWithPassword(ctx, { identifier: "u@t.com", password: "wrong" }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("账号禁用 → 403", async () => {
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt", account_status: "disabled",
        }),
      },
    });
    await expect(loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" }))
      .rejects.toMatchObject({ status: 403, code: 40003 });
  });

  it("账号驳回 → 403", async () => {
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt", account_status: "rejected",
        }),
      },
    });
    await expect(loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" }))
      .rejects.toMatchObject({ status: 403, code: 40003 });
  });

  it("正常登录 → 返回 payload + tokens", async () => {
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt", account_status: "active",
        }),
      },
    });
    const result = await loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" });
    expect(result.payload).toBeTruthy();
    expect(result.accessToken).toBe("access");
    expect(result.refreshToken).toBe("refresh");
  });

  it("旧哈希算法 → 自动升级为 bcrypt", async () => {
    const updatePw = vi.fn();
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "old-sha", password_hash_type: "sha256", account_status: "active",
        }),
        updatePasswordById: updatePw,
      },
    });
    await loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" });
    expect(updatePw).toHaveBeenCalledWith(1, "new-bcrypt-hash", "bcrypt");
  });

  it("JWT 签发失败 → 静默降级（token=null）", async () => {
    vi.mocked(issueTokenPair).mockRejectedValueOnce(new Error("no secret"));
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt", account_status: "active",
        }),
      },
    });
    const result = await loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" });
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
  });
});
