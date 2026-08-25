/**
 * server/routes/ 路由层测试
 * 覆盖 admin/middleware.ts (requireAdmin), system.routes.ts (readBuildVersion)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── admin/middleware ──
import { requireAdmin } from "../../../server/routes/admin/middleware";

describe("requireAdmin", () => {
  function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = "test-secret-token";
  });

  afterEach(() => {
    delete process.env.ADMIN_API_TOKEN;
  });

  it("正确 token 放行", () => {
    const req = { headers: { "x-admin-token": "test-secret-token" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("错误 token 返回 401", () => {
    const req = { headers: { "x-admin-token": "wrong-token" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("Bearer token 方式", () => {
    const req = { headers: { authorization: "Bearer test-secret-token" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("无 token 返回 401", () => {
    const req = { headers: {} } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("未配置 ADMIN_API_TOKEN 返回 503", () => {
    delete process.env.ADMIN_API_TOKEN;
    const req = { headers: { "x-admin-token": "any" } } as any;
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

// ── utils/params ──
import { parseOptionalInt, parseOptionalString } from "../../../server/utils/params";

describe("parseOptionalInt", () => {
  it("有效数字字符串", () => {
    expect(parseOptionalInt({ page: "42" } as any, "page", 1, 1000)).toBe(42);
    expect(parseOptionalInt({ value: "0" } as any, "value", 0, 100)).toBe(0);
  });

  it("非法值返回 fallback", () => {
    expect(parseOptionalInt({ page: "abc" } as any, "page", 1, 1000, 1)).toBe(1);
    expect(parseOptionalInt({} as any, "page", 1, 1000, 5)).toBe(5);
  });

  it("结果 clamp 到 [min, max]", () => {
    expect(parseOptionalInt({ page: "0" } as any, "page", 1, 1000)).toBe(1);
    expect(parseOptionalInt({ page: "9999" } as any, "page", 1, 1000)).toBe(1000);
  });

  it("负数 floor 到 min", () => {
    expect(parseOptionalInt({ v: "-5" } as any, "v", 0, 100)).toBe(0);
  });
});

describe("parseOptionalString", () => {
  it("有效字符串 trim 直通", () => {
    expect(parseOptionalString({ q: "hello" } as any, "q")).toBe("hello");
    expect(parseOptionalString({ q: "  hi  " } as any, "q")).toBe("hi");
  });

  it("缺失键返回空串", () => {
    expect(parseOptionalString({} as any, "q")).toBe("");
  });

  it("maxLen 截断", () => {
    expect(parseOptionalString({ q: "abcdef" } as any, "q", 3)).toBe("abc");
  });
});
