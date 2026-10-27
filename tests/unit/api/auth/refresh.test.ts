/**
 * Token 刷新路由测试
 * @module tests/unit/api/auth/refresh.test.ts
 * @description 覆盖：缺少 token、无效 token、token 已失效、用户不存在、
 *              账号禁用（吊销会话）、正常刷新、多标签页安全（旧 token 不删除）、
 *              旧 token 无 uid → 403（user_key 回退路径已退役）。
 * 401 语义红线（③）：刷新令牌无效/过期/撤销 = 会话已死、不可刷新，用 403；
 *   客户端行为不变（api-client 的 tryRefreshToken 对 !res.ok 一律返回 null → 清凭据 + 广播登出事件）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({
  getContext: vi.fn(),
}));
vi.mock("@/lib/services/jwt", () => ({
  signAccessToken: vi.fn(() => "new-access"),
  signRefreshToken: vi.fn(() => ({ token: "new-refresh", tokenHash: "new-hash" })),
  verifyRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn((t: string) => `hash:${t}`),
  getRefreshTokenExpiresAt: vi.fn(() => new Date("2099-01-01")),
}));
vi.mock("@/lib/utils/auth-cookies-next", () => ({
  readRefreshCookieFromRequest: vi.fn(),
  setRefreshCookieOnResponse: vi.fn(),
}));

import { POST } from "@/app/api/auth/refresh/route";
import { getContext } from "@/lib/db/context";
import { verifyRefreshToken } from "@/lib/services/jwt";
import { readRefreshCookieFromRequest } from "@/lib/utils/auth-cookies-next";
import {
  EC_REFRESH_TOKEN_MISSING, EC_REFRESH_TOKEN_INVALID, EC_REFRESH_TOKEN_EXPIRED, EC_REFRESH_TOKEN_REVOKED,
} from "@/shared/constants/api";

function makeReq() {
  return new NextRequest("http://localhost/api/auth/refresh", { method: "POST" });
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContext).mockReturnValue({
      user: {
        authRepo: {
          findRefreshTokenByHash: vi.fn(),
          insertRefreshToken: vi.fn(),
          deleteRefreshTokensByUser: vi.fn(),
        },
        usersRepo: { findProfileById: vi.fn() },
      },
    } as any);
  });

  it("缺少 refresh token → 400/EC_REFRESH_TOKEN_MISSING", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("");
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(EC_REFRESH_TOKEN_MISSING);
  });

  it("token 验证失败 → 403/EC_REFRESH_TOKEN_INVALID", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("bad-token");
    vi.mocked(verifyRefreshToken).mockImplementation(() => {
      throw new Error("invalid");
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(EC_REFRESH_TOKEN_INVALID);
  });

  it("DB 中无存储 → 403/EC_REFRESH_TOKEN_REVOKED", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("old-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: 1 } as any);
    const ctx = getContext() as any;
    ctx.user.authRepo.findRefreshTokenByHash.mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(EC_REFRESH_TOKEN_REVOKED);
  });

  it("用户不存在 → 404/40044", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("valid-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: 999 } as any);
    const ctx = getContext() as any;
    ctx.user.authRepo.findRefreshTokenByHash.mockResolvedValue({ user_id: 999 });
    ctx.user.usersRepo.findProfileById.mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
  });

  it("账号禁用 → 403 + 吊销全部会话", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("valid-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: 1 } as any);
    const ctx = getContext() as any;
    ctx.user.authRepo.findRefreshTokenByHash.mockResolvedValue({ user_id: 1 });
    ctx.user.usersRepo.findProfileById.mockResolvedValue({
      id: 1, account_status: "disabled",
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(ctx.user.authRepo.deleteRefreshTokensByUser).toHaveBeenCalledWith(1);
  });

  it("账号驳回 → 403 + 吊销全部会话", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("valid-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: 1 } as any);
    const ctx = getContext() as any;
    ctx.user.authRepo.findRefreshTokenByHash.mockResolvedValue({ user_id: 1 });
    ctx.user.usersRepo.findProfileById.mockResolvedValue({
      id: 1, account_status: "rejected",
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(ctx.user.authRepo.deleteRefreshTokensByUser).toHaveBeenCalledWith(1);
  });

  it("正常刷新 → 200 + 新 token + 旧 token 保留（多标签页安全）", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("valid-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: 1 } as any);
    const ctx = getContext() as any;
    ctx.user.authRepo.findRefreshTokenByHash.mockResolvedValue({ user_id: 1 });
    ctx.user.usersRepo.findProfileById.mockResolvedValue({
      id: 1, account_status: "active",
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.token).toBe("new-access");
    // 关键断言：不调用 deleteRefreshToken（非严格轮换 = 多标签页安全）
    expect(ctx.user.authRepo.deleteRefreshTokensByUser).not.toHaveBeenCalled();
    expect(ctx.user.authRepo.insertRefreshToken).toHaveBeenCalledWith(1, "new-hash", expect.any(Date));
  });

  it("旧 token 无 uid → 403（user_key 回退路径已退役）", async () => {
    // crm_users.user_key 列退役收尾：不再兼容无 uid 的旧 token，直接拒绝要求重新登录
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("old-token");
    vi.mocked(verifyRefreshToken).mockReturnValue({ uid: undefined } as any);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(EC_REFRESH_TOKEN_EXPIRED);
  });
});
