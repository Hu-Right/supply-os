/**
 * server/middleware/ + server/payment/ 测试
 * 覆盖 errorHandler, HttpError, asyncHandler, notFoundHandler,
 *       createRateLimiter, csrfProtection
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── errorHandler ──
import { errorHandler, HttpError, notFoundHandler, asyncHandler } from "../../../server/middleware/errorHandler";

describe("HttpError", () => {
  it("携带 statusCode 和 message", () => {
    const err = new HttpError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("errorHandler", () => {
  function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    return res;
  }

  it("业务错误按 statusCode 返回", () => {
    const err = new HttpError(400, "Bad request");
    const res = makeRes();
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Bad request" });
  });

  it("未知错误 500", () => {
    const err = new Error("unexpected");
    const res = makeRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });
});

describe("notFoundHandler", () => {
  it("/api/* 路径返回 404", () => {
    const req = { path: "/api/nonexistent" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();
    notFoundHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("非 /api/ 路径放行", () => {
    const req = { path: "/dashboard" } as any;
    const res = {} as any;
    const next = vi.fn();
    notFoundHandler(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("asyncHandler", () => {
  it("正常调用 next 不触发", async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    handler(req, res, next);
    // 等待 Promise 解析
    await new Promise((r) => setTimeout(r, 10));
    expect(next).not.toHaveBeenCalled();
  });

  it("异常传递给 next", async () => {
    const handler = asyncHandler(async () => {
      throw new Error("test error");
    });
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    handler(req, res, next);
    await new Promise((r) => setTimeout(r, 10));
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── rateLimiter ──
import { createRateLimiter } from "../../../server/middleware/rateLimiter";

describe("createRateLimiter", () => {
  it("首次 check 不阻断", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 3 });
    expect(limiter.check("user-1").blocked).toBe(false);
  });

  it("超过 maxAttempts 后阻断", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 2 });
    limiter.record("user-1");
    limiter.record("user-1");
    const result = limiter.check("user-1");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("clear 解除限制", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 1 });
    limiter.record("user-1");
    expect(limiter.check("user-1").blocked).toBe(true);
    limiter.clear("user-1");
    expect(limiter.check("user-1").blocked).toBe(false);
  });

  it("不同 key 独立计数", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 1 });
    limiter.record("user-1");
    expect(limiter.check("user-1").blocked).toBe(true);
    expect(limiter.check("user-2").blocked).toBe(false);
  });

  it("supportLastSentAt 间隔检查", () => {
    const limiter = createRateLimiter({
      windowMs: 60000, maxAttempts: 10,
      supportLastSentAt: true, minIntervalMs: 5000,
    });
    limiter.record("phone-1");
    // 立即再 check 应被 lastSentAt 间隔阻断
    const result = limiter.check("phone-1");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });
});

// ── csrfProtection ──
import { csrfProtection } from "../../../server/middleware/csrf";

describe("csrfProtection", () => {
  function makeReq(overrides: any = {}): Request {
    return {
      method: "POST",
      headers: {},
      ...overrides,
    } as any;
  }

  function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("GET 请求放行", () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("Bearer Token 请求放行", () => {
    const req = makeReq({ headers: { authorization: "Bearer token123" } });
    const res = makeRes();
    const next = vi.fn();
    csrfProtection(req, res, next);
    // 白名单为空时 JWT 请求也应放行
    expect(next).toHaveBeenCalled();
  });

  it("无 Origin 的 POST 返回 403", () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
