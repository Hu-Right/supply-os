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
    buildUserResponse: vi.fn().mockResolvedValue({ id: 1, email: "u@t.com", nickname: "Test" }),
    issueTokenPair: vi.fn().mockResolvedValue({ token: "access", refreshToken: "refresh" }),
  };
});

import { loginWithPassword } from "@/lib/services/auth-login";
import { verifyPassword, issueTokenPair } from "@/lib/services/auth";
import { EC_ACCOUNT_ISSUE } from "@/shared/constants/api";

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    user: {
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue(null),
        updatePasswordById: vi.fn().mockResolvedValue(undefined),
        updateLastLoginById: vi.fn().mockResolvedValue(undefined),
        ...overrides.usersRepo,
      },
      membershipRepo: {},
      authRepo: { insertRefreshToken: vi.fn() },
    },
    supplier: { directoryRepo: {} },
  } as any;
}

describe("loginWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复默认 mock
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(issueTokenPair).mockResolvedValue({ token: "access", refreshToken: "refresh" });
  });

  // 401 语义红线（③）：凭据被拒是「会话已死」，不是「未登录可刷新」——403 + 专属码，
  // 避开 api-client 的 401 刷新重试/登出陷阱（时序攻击防护不变：仍跑一次恒时验证）。
  it("用户不存在 → 403 + EC_ACCOUNT_ISSUE（恒时验证仍执行）", async () => {
    const ctx = makeCtx();
    await expect(loginWithPassword(ctx, { identifier: "nobody", password: "pw" }))
      .rejects.toMatchObject({ status: 403, code: EC_ACCOUNT_ISSUE });
    expect(verifyPassword).toHaveBeenCalled(); // 恒时验证
  });

  it("密码错误 → 403 + EC_ACCOUNT_ISSUE", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "hash", password_hash_type: "bcrypt",
        }),
      },
    });
    await expect(loginWithPassword(ctx, { identifier: "u@t.com", password: "wrong" }))
      .rejects.toMatchObject({ status: 403, code: EC_ACCOUNT_ISSUE });
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
      .rejects.toMatchObject({ status: 403, code: 41118 }); // EC_ACCOUNT_DISABLED
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
      .rejects.toMatchObject({ status: 403, code: 41118 }); // EC_ACCOUNT_DISABLED
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

  it("存量弱哈希账号 → 403 引导重置（不再校验旧密码）", async () => {
    const ctx = makeCtx({
      usersRepo: {
        findAuthByIdentifier: vi.fn().mockResolvedValue({
          id: 1, password_hash: "old-sha", password_hash_type: "sha256", account_status: "active",
        }),
      },
    });
    await expect(loginWithPassword(ctx, { identifier: "u@t.com", password: "ok" }))
      .rejects.toMatchObject({ status: 403, code: 40043 });
    expect(verifyPassword).not.toHaveBeenCalled(); // 弱哈希不参与任何密码比对
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
