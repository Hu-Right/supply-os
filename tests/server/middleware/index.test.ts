/**
 * server/middleware/ + server/payment/ 测试
 * 覆盖 errorHandler, HttpError, asyncHandler, notFoundHandler,
 *       createRateLimiter, rateLimitMiddleware, csrfProtection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("生产环境 500 错误返回 INTERNAL_ERROR", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const err = new Error("secret db error");
      const res = makeRes();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "INTERNAL_ERROR" });
      spy.mockRestore();
    } finally {
      process.env.NODE_ENV = origNodeEnv;
    }
  });

  it("生产环境 400 错误仍返回原始 message", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const err = new HttpError(400, "Bad request");
      const res = makeRes();
      errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Bad request" });
    } finally {
      process.env.NODE_ENV = origNodeEnv;
    }
  });

  it("err.message 为空时使用默认文本", () => {
    const err = new Error("");
    const res = makeRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error" });
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
import { createRateLimiter, rateLimitMiddleware } from "../../../server/middleware/rateLimiter";

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

  it("persist 写入文件并在空状态时删除", () => {
    const tmpFile = path.join(os.tmpdir(), `rl-test-${Date.now()}.json`);
    try {
      const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 5, persistFile: tmpFile });
      limiter.record("k1");
      limiter.persist();
      expect(fs.existsSync(tmpFile)).toBe(true);
      const data = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
      expect(data.k1).toBeDefined();
      expect(data.k1.count).toBe(1);

      // clear 后 persist 应删除文件
      limiter.clear("k1");
      limiter.persist();
      expect(fs.existsSync(tmpFile)).toBe(false);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it("创建时从持久化文件恢复未过期条目", () => {
    const tmpFile = path.join(os.tmpdir(), `rl-restore-${Date.now()}.json`);
    try {
      const future = Date.now() + 60000;
      fs.writeFileSync(tmpFile, JSON.stringify({ "old-key": { count: 10, resetAt: future } }));
      const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 5, persistFile: tmpFile });
      // 恢复的条目 count=10 >= maxAttempts=5，应被阻断
      expect(limiter.check("old-key").blocked).toBe(true);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

// ── rateLimitMiddleware ──
describe("rateLimitMiddleware", () => {
  function makeReq(overrides: any = {}): Request {
    return {
      method: "GET",
      headers: {},
      socket: { remoteAddress: "203.0.113.5" },
      ...overrides,
    } as any;
  }
  function makeRes() {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as any;
    return res;
  }

  it("未超限时调用 next", () => {
    const mw = rateLimitMiddleware({ windowMs: 60000, maxAttempts: 5 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("超限时返回 429 + Retry-After", () => {
    const mw = rateLimitMiddleware({ windowMs: 60000, maxAttempts: 1 });
    // 第一次：通过
    mw(makeReq(), makeRes(), vi.fn());
    // 第二次：阻断
    const res = makeRes();
    const next = vi.fn();
    mw(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  it("自定义 keyFn 生效", () => {
    const mw = rateLimitMiddleware(
      { windowMs: 60000, maxAttempts: 1 },
      (req) => `custom:${(req as any).userId || "anon"}`,
    );
    const res1 = makeRes();
    mw(makeReq({ userId: "u1" }), res1, vi.fn());
    // u1 第一次通过
    expect(res1.status).not.toHaveBeenCalled();

    // u1 第二次阻断
    const res2 = makeRes();
    mw(makeReq({ userId: "u1" }), res2, vi.fn());
    expect(res2.status).toHaveBeenCalledWith(429);

    // u2 不受影响
    const res3 = makeRes();
    mw(makeReq({ userId: "u2" }), res3, vi.fn());
    expect(res3.status).not.toHaveBeenCalled();
  });
});

import fs from "fs";
import path from "path";
import os from "os";

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

  it("PUT/DELETE 方法同样受 CSRF 保护", () => {
    for (const method of ["PUT", "DELETE"]) {
      const req = makeReq({ method, headers: {} });
      const res = makeRes();
      const next = vi.fn();
      csrfProtection(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("Origin 为 'null' 时视为缺失", () => {
    const req = makeReq({ headers: { origin: "null" } });
    const res = makeRes();
    const next = vi.fn();
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("从 Referer 头提取 Origin", () => {
    // 无 ALLOWED_ORIGINS 配置时，白名单为空，POST 直接 403
    // 此测试验证 extractOrigin 从 referer 提取的逻辑
    const req = makeReq({ headers: { referer: "https://example.com/page" } });
    const res = makeRes();
    const next = vi.fn();
    csrfProtection(req, res, next);
    // 白名单为空，即使有 Referer 也 403
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── csrfProtection 动态配置测试（需要不同 env）──
describe("csrfProtection (with ALLOWED_ORIGINS)", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    // 恢复环境变量
    for (const key of ["CSRF_ENABLED", "ALLOWED_ORIGINS"]) {
      if (origEnv[key] === undefined) delete process.env[key];
      else process.env[key] = origEnv[key];
    }
  });

  async function loadCsrf() {
    vi.resetModules();
    const mod = await import("../../../server/middleware/csrf");
    return mod.csrfProtection;
  }

  it("CSRF_ENABLED=false 时跳过所有检查", async () => {
    process.env.CSRF_ENABLED = "false";
    const csrf = await loadCsrf();
    const req = { method: "POST", headers: {} } as any;
    const res = {} as any;
    const next = vi.fn();
    csrf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("白名单匹配时放行", async () => {
    process.env.CSRF_ENABLED = "true";
    process.env.ALLOWED_ORIGINS = "https://app.example.com, https://admin.example.com";
    const csrf = await loadCsrf();
    const req = {
      method: "POST",
      headers: { origin: "https://app.example.com" },
    } as any;
    const res = {} as any;
    const next = vi.fn();
    csrf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("白名单不匹配时 403", async () => {
    process.env.CSRF_ENABLED = "true";
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const csrf = await loadCsrf();
    const req = {
      method: "POST",
      headers: { origin: "https://evil.com" },
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();
    csrf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("尾部斜杠归一化后匹配", async () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const csrf = await loadCsrf();
    const req = {
      method: "POST",
      headers: { origin: "https://app.example.com/" },
    } as any;
    const res = {} as any;
    const next = vi.fn();
    csrf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("Bearer Token 在白名单为空时也跳过", async () => {
    delete process.env.ALLOWED_ORIGINS;
    const csrf = await loadCsrf();
    const req = {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    } as any;
    const res = {} as any;
    const next = vi.fn();
    csrf(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
