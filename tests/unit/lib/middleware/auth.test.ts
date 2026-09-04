/**
 * 认证中间件测试
 * @module tests/unit/lib/middleware/auth.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/services/jwt", () => ({
  verifyAccessToken: vi.fn((token: string) => {
    if (token === "valid") return { uid: 42, user_key: "user@test.com", type: "access" };
    if (token === "no-uid") return { uid: undefined, user_key: "user@test.com", type: "access" };
    throw new Error("invalid token");
  }),
}));
vi.mock("@/lib/utils/normalize", () => ({
  normalizeUserKey: vi.fn((key: string) => key || ""),
}));

const { extractUserKey, requireUserKeyOrThrow } = await import("@/lib/middleware/auth");

function makeReq(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/test", { headers });
}

describe("extractUserKey", () => {
  it("无 Authorization header → authViaJwt=false", async () => {
    const result = await extractUserKey(makeReq());
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });

  it("非 Bearer 格式 → authViaJwt=false", async () => {
    const result = await extractUserKey(makeReq("Basic abc"));
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });

  it("有效 Bearer token → 返回 userId + userKey", async () => {
    const result = await extractUserKey(makeReq("Bearer valid"));
    expect(result.userId).toBe(42);
    expect(result.userKey).toBe("user@test.com");
    expect(result.authViaJwt).toBe(true);
  });

  it("token 验证失败 → authViaJwt=false", async () => {
    const result = await extractUserKey(makeReq("Bearer invalid"));
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });

  it("uid 缺失 → userId=0, authViaJwt=true", async () => {
    const result = await extractUserKey(makeReq("Bearer no-uid"));
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(true);
  });
});

describe("requireUserKeyOrThrow", () => {
  it("未认证 → 抛出 RouteError 401", async () => {
    await expect(requireUserKeyOrThrow(makeReq())).rejects.toMatchObject({ status: 401 });
  });

  it("已认证 → 返回 AuthResult", async () => {
    const result = await requireUserKeyOrThrow(makeReq("Bearer valid"));
    expect(result.userId).toBe(42);
  });
});
