import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { extractUserKey, requireUserKey } from "@/lib/middleware/auth";

// Mock JWT 验证模块
vi.mock("@/lib/services/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

import { verifyAccessToken } from "@/lib/services/jwt";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    headers: new Headers(headers),
  });
}

describe("extractUserKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无 Authorization 头 → userId=0, authViaJwt=false", async () => {
    const result = await extractUserKey(makeRequest());
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });

  it("非 Bearer 格式 → userId=0, authViaJwt=false", async () => {
    const result = await extractUserKey(makeRequest({ authorization: "Basic abc123" }));
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });

  it("有效 Bearer Token → 返回 userId（AuthResult 已无 userKey 字段）", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 55,
    } as never);
    const result = await extractUserKey(makeRequest({ authorization: "Bearer valid-token" }));
    expect(result.userId).toBe(55);
    expect(result.authViaJwt).toBe(true);
    // crm_users.user_key 列退役收尾：AuthResult 已不再暴露 userKey 字段
    expect((result as unknown as Record<string, unknown>).userKey).toBeUndefined();
  });

  it("Token 验证失败 → userId=0, authViaJwt=false", async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error("invalid token");
    });
    const result = await extractUserKey(makeRequest({ authorization: "Bearer bad-token" }));
    expect(result.userId).toBe(0);
    expect(result.authViaJwt).toBe(false);
  });
});

describe("requireUserKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未认证 → 返回 401 Response", async () => {
    const result = await requireUserKey(makeRequest());
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe(40042);
  });

  it("已认证 → 返回 AuthResult", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      type: "access",
      uid: 56,
    } as never);
    const result = await requireUserKey(makeRequest({ authorization: "Bearer valid-token" }));
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { userId: number }).userId).toBe(56);
  });
});
