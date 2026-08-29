import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { extractUserKey, requireUserKey } from "@/lib/middleware/auth";

// Mock JWT 验证模块
vi.mock("@/lib/services/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("@/lib/utils/normalize", () => ({
  normalizeUserKey: vi.fn((key: string) => key ? key.toLowerCase() : null),
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

  it("无 Authorization 头 → 返回空 userKey", async () => {
    const result = await extractUserKey(makeRequest());
    expect(result.userKey).toBe("");
    expect(result.authViaJwt).toBe(false);
  });

  it("非 Bearer 格式 → 返回空 userKey", async () => {
    const result = await extractUserKey(makeRequest({ authorization: "Basic abc123" }));
    expect(result.userKey).toBe("");
    expect(result.authViaJwt).toBe(false);
  });

  it("有效 Bearer Token → 返回 userKey", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      user_key: "Test@User.com",
      email: "test@user.com",
      type: "access",
    });
    const result = await extractUserKey(makeRequest({ authorization: "Bearer valid-token" }));
    expect(result.userKey).toBe("test@user.com");
    expect(result.authViaJwt).toBe(true);
  });

  it("Token 验证失败 → 返回空 userKey", async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error("invalid token");
    });
    const result = await extractUserKey(makeRequest({ authorization: "Bearer bad-token" }));
    expect(result.userKey).toBe("");
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
      user_key: "user@test.com",
      email: "user@test.com",
      type: "access",
    });
    const result = await requireUserKey(makeRequest({ authorization: "Bearer valid-token" }));
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { userKey: string }).userKey).toBe("user@test.com");
  });
});
