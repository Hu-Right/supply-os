// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { HttpError, errorHandler, notFoundHandler, asyncHandler } from "../../../server/middleware/errorHandler";
import type { Request, Response, NextFunction } from "express";

function createMockRes(): Response {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe("HttpError", () => {
  it("creates error with statusCode and message", () => {
    const err = new HttpError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err instanceof Error).toBe(true);
  });

  it("creates error with 500 status", () => {
    const err = new HttpError(500, "Internal error");
    expect(err.statusCode).toBe(500);
  });
});

describe("errorHandler", () => {
  it("returns status code from error", () => {
    const err = new HttpError(400, "Bad request");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Bad request" });
  });

  it("returns 500 for unknown error", () => {
    const err = new Error("Something broke");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns Internal Server Error for empty message", () => {
    const err = new Error("");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns message for 4xx errors", () => {
    const err = new HttpError(404, "Resource not found");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.json).toHaveBeenCalledWith({ error: "Resource not found" });
  });

  it("returns INTERNAL_ERROR in production for 500", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const err = new Error("Database connection failed");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.json).toHaveBeenCalledWith({ error: "INTERNAL_ERROR" });
    process.env.NODE_ENV = originalEnv;
  });

  it("returns actual message in development for 500", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const err = new Error("Database connection failed");
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.json).toHaveBeenCalledWith({ error: "Database connection failed" });
    process.env.NODE_ENV = originalEnv;
  });

  it("uses statusCode from error if present", () => {
    const err: any = new Error("Custom error");
    err.statusCode = 422;
    const res = createMockRes();
    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

describe("notFoundHandler", () => {
  it("returns 404 for /api/ paths", () => {
    const req = { path: "/api/unknown" } as Request;
    const res = createMockRes();
    notFoundHandler(req, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "NOT_FOUND" });
  });

  it("calls next for non-api paths", () => {
    const req = { path: "/dashboard" } as Request;
    const res = createMockRes();
    const next = vi.fn();
    notFoundHandler(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 for /api/v1/ paths", () => {
    const req = { path: "/api/v1/users" } as Request;
    const res = createMockRes();
    notFoundHandler(req, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("asyncHandler", () => {
  it("calls the wrapped function", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const handler = asyncHandler(fn);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    handler(req, res, next);
    // Wait for promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  it("calls next with error on rejection", async () => {
    const error = new Error("Async error");
    const fn = vi.fn().mockRejectedValue(error);
    const handler = asyncHandler(fn);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    handler(req, res, next);
    // Wait for promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next).toHaveBeenCalledWith(error);
  });

  it("does not call next on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const handler = asyncHandler(fn);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    handler(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next).not.toHaveBeenCalled();
  });
});
