/**
 * 登出路由测试
 * @module tests/unit/api/auth/logout.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/services/jwt", () => ({
  hashRefreshToken: vi.fn((t: string) => `hash:${t}`),
}));
vi.mock("@/lib/utils/auth-cookies-next", () => ({
  readRefreshCookieFromRequest: vi.fn(),
  clearRefreshCookieOnResponse: vi.fn(),
}));

import { POST } from "@/app/api/auth/logout/route";
import { getContext } from "@/lib/db/context";
import { readRefreshCookieFromRequest, clearRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContext).mockReturnValue({
      user: { authRepo: { deleteRefreshTokenByHash: vi.fn() } },
    } as any);
  });

  it("有 refresh token → 删除 DB 记录 + 清除 cookie", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("my-token");
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const ctx = getContext() as any;
    expect(ctx.user.authRepo.deleteRefreshTokenByHash).toHaveBeenCalledWith("hash:my-token");
    expect(clearRefreshCookieOnResponse).toHaveBeenCalled();
  });

  it("无 refresh token → 直接成功（不操作 DB）", async () => {
    vi.mocked(readRefreshCookieFromRequest).mockReturnValue("");
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const ctx = getContext() as any;
    expect(ctx.user.authRepo.deleteRefreshTokenByHash).not.toHaveBeenCalled();
  });
});
