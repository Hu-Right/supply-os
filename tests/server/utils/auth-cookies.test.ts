/**
 * server/utils/auth-cookies.ts 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from "../../../server/utils/auth-cookies";
import type { Request, Response } from "express";

function makeRes(): Response {
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  return res;
}

function makeReq(overrides: { cookies?: Record<string, string>; cookieHeader?: string }): Request {
  return {
    cookies: overrides.cookies,
    headers: overrides.cookieHeader ? { cookie: overrides.cookieHeader } : {},
  } as unknown as Request;
}

describe("setRefreshCookie", () => {
  it("设置 HttpOnly Cookie 含正确属性", () => {
    const res = makeRes();
    setRefreshCookie(res, "test-token-abc");
    expect(res.cookie).toHaveBeenCalledWith(
      "supply_os_refresh_token",
      "test-token-abc",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );
  });

  it("生产环境 secure=true", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const res = makeRes();
    setRefreshCookie(res, "tok");
    expect(res.cookie).toHaveBeenCalledWith(
      "supply_os_refresh_token",
      "tok",
      expect.objectContaining({ secure: true }),
    );
    process.env.NODE_ENV = orig;
  });

  it("非生产环境 secure=false", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const res = makeRes();
    setRefreshCookie(res, "tok");
    expect(res.cookie).toHaveBeenCalledWith(
      "supply_os_refresh_token",
      "tok",
      expect.objectContaining({ secure: false }),
    );
    process.env.NODE_ENV = orig;
  });
});

describe("clearRefreshCookie", () => {
  it("清除 Cookie 含正确属性", () => {
    const res = makeRes();
    clearRefreshCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      "supply_os_refresh_token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/api/auth",
      }),
    );
  });
});

describe("readRefreshCookie", () => {
  it("优先从 req.cookies 读取", () => {
    const req = makeReq({ cookies: { supply_os_refresh_token: "cookie-token" } });
    expect(readRefreshCookie(req)).toBe("cookie-token");
  });

  it("req.cookies 值自动 trim", () => {
    const req = makeReq({ cookies: { supply_os_refresh_token: "  spaced  " } });
    expect(readRefreshCookie(req)).toBe("spaced");
  });

  it("回退到 Cookie 头手动解析", () => {
    const req = makeReq({ cookieHeader: "other=val; supply_os_refresh_token=header-token; x=y" });
    expect(readRefreshCookie(req)).toBe("header-token");
  });

  it("Cookie 头中的值自动 trim 和 decode", () => {
    const req = makeReq({ cookieHeader: "supply_os_refresh_token=encoded%20value" });
    expect(readRefreshCookie(req)).toBe("encoded value");
  });

  it("无 Cookie 时返回空字符串", () => {
    const req = makeReq({});
    expect(readRefreshCookie(req)).toBe("");
  });

  it("Cookie 头中无目标 Cookie 返回空字符串", () => {
    const req = makeReq({ cookieHeader: "other=val; another=x" });
    expect(readRefreshCookie(req)).toBe("");
  });
});
