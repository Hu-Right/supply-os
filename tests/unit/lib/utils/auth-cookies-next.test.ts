/**
 * 认证 Cookie 工具测试
 * @module tests/unit/lib/utils/auth-cookies-next.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  readRefreshCookieFromRequest,
  setRefreshCookieOnResponse,
  clearRefreshCookieOnResponse,
} from "@/lib/utils/auth-cookies-next";

describe("readRefreshCookieFromRequest", () => {
  it("NextRequest cookies API 存在 → 提取 token", () => {
    const req = {
      cookies: {
        get: (name: string) =>
          name === "supply_os_refresh_token" ? { value: "abc123" } : undefined,
      },
      headers: new Headers(),
    };
    expect(readRefreshCookieFromRequest(req as any)).toBe("abc123");
  });

  it("cookies API 不存在 → 回退到 Cookie header 解析", () => {
    const req = { headers: new Headers({ cookie: "supply_os_refresh_token=xyz789" }) };
    expect(readRefreshCookieFromRequest(req as any)).toBe("xyz789");
  });

  it("无 Cookie → 返回空字符串", () => {
    const req = { headers: new Headers() };
    expect(readRefreshCookieFromRequest(req as any)).toBe("");
  });

  it("多个 Cookie → 正确提取目标值", () => {
    const req = {
      headers: new Headers({ cookie: "other=1; supply_os_refresh_token=tok; another=2" }),
    };
    expect(readRefreshCookieFromRequest(req as any)).toBe("tok");
  });
});

describe("setRefreshCookieOnResponse", () => {
  it("Set-Cookie 头包含 HttpOnly + SameSite + Max-Age", () => {
    const res = new Response();
    setRefreshCookieOnResponse(res, "my-token");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("supply_os_refresh_token=my-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=604800");
  });
});

describe("clearRefreshCookieOnResponse", () => {
  it("Max-Age=0 清除 Cookie", () => {
    const res = new Response();
    clearRefreshCookieOnResponse(res);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("supply_os_refresh_token=");
  });
});
