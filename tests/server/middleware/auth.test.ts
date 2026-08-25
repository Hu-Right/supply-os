/**
 * server/middleware/auth — optionalAuth / requireAuth 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn(),
  extractBearerToken: vi.fn((authHeader?: string) => {
    if (!authHeader?.startsWith("Bearer ")) return "";
    return authHeader.slice(7);
  }),
}));

import { optionalAuth, requireAuth } from "../../../server/middleware/auth";
import { verifyAccessToken } from "../../../server/services/jwt";

const mockVerifyAccessToken = vi.mocked(verifyAccessToken);

function createMockReq(authHeader?: string): Request {
  const req = {
    headers: { authorization: authHeader },
    userKey: "",
    authViaJwt: false,
  } as any;
  return req;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return res;
}

const next: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(next).mockReset();
});

describe("optionalAuth", () => {
  it("有效 JWT → req.userKey 填充", () => {
    mockVerifyAccessToken.mockReturnValue({ user_key: "User@Example.com" } as any);
    const req = createMockReq("Bearer valid-token");

    optionalAuth(req, createMockRes(), next);

    expect(req.userKey).toBe("user@example.com");
    expect(req.authViaJwt).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it("无 Token → 空 userKey（匿名）", () => {
    const req = createMockReq();

    optionalAuth(req, createMockRes(), next);

    expect(req.userKey).toBe("");
    expect(req.authViaJwt).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it("无效 Token → 空 userKey", () => {
    mockVerifyAccessToken.mockImplementation(() => { throw new Error("invalid"); });
    const req = createMockReq("Bearer bad-token");

    optionalAuth(req, createMockRes(), next);

    expect(req.userKey).toBe("");
    expect(req.authViaJwt).toBe(false);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireAuth", () => {
  it("有效 JWT → next()", () => {
    mockVerifyAccessToken.mockReturnValue({ user_key: "admin@test.com" } as any);
    const req = createMockReq("Bearer valid-token");

    requireAuth(req, createMockRes(), next);

    expect(req.userKey).toBe("admin@test.com");
    expect(req.authViaJwt).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it("无 Token → 401", () => {
    const req = createMockReq();
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 40042 }));
    expect(next).not.toHaveBeenCalled();
  });

  it("无效 Token → 401", () => {
    mockVerifyAccessToken.mockImplementation(() => { throw new Error("expired"); });
    const req = createMockReq("Bearer expired-token");
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("Token 有效但 user_key 为空 → 401", () => {
    mockVerifyAccessToken.mockReturnValue({ user_key: "" } as any);
    const req = createMockReq("Bearer token-empty-key");
    const res = createMockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
