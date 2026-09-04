/**
 * 获取当前用户路由测试
 * @module tests/unit/api/auth/user.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn(),
}));
vi.mock("@/lib/services/auth", () => ({
  buildUserResponse: vi.fn().mockResolvedValue({ id: 1, nickname: "Test" }),
}));

import { GET } from "@/app/api/auth/user/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";

describe("GET /api/auth/user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContext).mockReturnValue({
      user: { usersRepo: { findProfileById: vi.fn() }, membershipRepo: {} },
      supplier: { registrationRepo: {} },
    } as any);
  });

  it("未通过 JWT 认证 → 403/40003", async () => {
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({
      userId: 1, authViaJwt: false,
    });
    const req = new NextRequest("http://localhost/api/auth/user");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(40003);
  });

  it("用户不存在 → 404/40044", async () => {
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({
      userId: 999, authViaJwt: true,
    });
    const ctx = getContext() as any;
    ctx.user.usersRepo.findProfileById.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/auth/user");
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe(40044);
  });

  it("正常 → 200 + user payload", async () => {
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({
      userId: 1, authViaJwt: true,
    });
    const ctx = getContext() as any;
    ctx.user.usersRepo.findProfileById.mockResolvedValue({ id: 1 });
    const req = new NextRequest("http://localhost/api/auth/user");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
