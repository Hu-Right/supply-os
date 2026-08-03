// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { extractUserKey, requireUserKey } from "../../../server/middleware/auth";
import {
  HttpError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from "../../../server/middleware/errorHandler";

// ─── extractUserKey / requireUserKey ────────────────────────────────────────
describe("auth middleware", () => {
  const buildAuthApp = (guard: boolean) => {
    const app = express();
    app.use(express.json());
    app.get("/probe", guard ? requireUserKey : extractUserKey, (req, res) => {
      res.json({ userKey: req.userKey });
    });
    return app;
  };

  describe("extractUserKey（非守卫）", () => {
    it("normalizes user_key from query (trim + lowercase)", async () => {
      const app = buildAuthApp(false);
      const res = await request(app).get("/probe?user_key=%20UPPER@TEST.COM%20");
      expect(res.status).toBe(200);
      expect(res.body.userKey).toBe("upper@test.com");
    });

    it("reads user_key from body on POST routes", async () => {
      const app = express();
      app.use(express.json());
      app.post("/probe", extractUserKey, (req, res) => {
        res.json({ userKey: req.userKey });
      });
      const res = await request(app).post("/probe").send({ user_key: "Body@Key.com" });
      expect(res.body.userKey).toBe("body@key.com");
    });

    it("does not block when user_key missing (empty string)", async () => {
      const app = buildAuthApp(false);
      const res = await request(app).get("/probe");
      expect(res.status).toBe(200);
      expect(res.body.userKey).toBe("");
    });

    it("treats 'guest' as anonymous", async () => {
      const app = buildAuthApp(false);
      const res = await request(app).get("/probe?user_key=GUEST");
      expect(res.body.userKey).toBe("");
    });

    it("truncates overly long keys to 190 chars", async () => {
      const app = buildAuthApp(false);
      const longKey = "a".repeat(250);
      const res = await request(app).get(`/probe?user_key=${longKey}`);
      expect(res.body.userKey).toHaveLength(190);
    });
  });

  describe("requireUserKey（守卫）", () => {
    it("returns 400 USER_REQUIRED when missing", async () => {
      const app = buildAuthApp(true);
      const res = await request(app).get("/probe");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("USER_REQUIRED");
    });

    it("returns 400 for guest key", async () => {
      const app = buildAuthApp(true);
      const res = await request(app).get("/probe?user_key=guest");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("USER_REQUIRED");
    });

    it("passes through with normalized key on req.userKey", async () => {
      const app = buildAuthApp(true);
      const res = await request(app).get("/probe?user_key=A@B.com");
      expect(res.status).toBe(200);
      expect(res.body.userKey).toBe("a@b.com");
    });
  });
});

// ─── errorHandler / notFoundHandler / asyncHandler ──────────────────────────
describe("errorHandler middleware", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const buildErrorApp = () => {
    const app = express();
    app.get("/http-error", () => {
      throw new HttpError(409, "已存在同名记录");
    });
    app.get("/boom", () => {
      throw new Error("unexpected");
    });
    app.get("/async-boom", asyncHandler(async () => {
      throw new HttpError(422, "参数不合法");
    }));
    app.get("/async-ok", asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    }));
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  };

  it("returns HttpError.statusCode with its message", async () => {
    const res = await request(buildErrorApp()).get("/http-error");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("已存在同名记录");
    // 4xx 不记服务端错误日志
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("maps unknown errors to 500 and logs them", async () => {
    const res = await request(buildErrorApp()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("unexpected");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("asyncHandler forwards async rejections to the error handler", async () => {
    const res = await request(buildErrorApp()).get("/async-boom");
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("参数不合法");
  });

  it("asyncHandler lets successful handlers respond normally", async () => {
    const res = await request(buildErrorApp()).get("/async-ok");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("notFoundHandler returns 404 only for /api/* paths", async () => {
    const app = buildErrorApp();
    const apiRes = await request(app).get("/api/definitely-missing");
    expect(apiRes.status).toBe(404);
    expect(apiRes.body.error).toBe("NOT_FOUND");
  });

  it("notFoundHandler lets non-API paths fall through", async () => {
    const app = express();
    app.use(notFoundHandler);
    // 非 /api 路径放行后无路由兜底，express 默认返回带 HTML 的 404（而非 JSON NOT_FOUND）
    const res = await request(app).get("/spa-page");
    expect(res.status).toBe(404);
    expect(res.body).not.toEqual({ error: "NOT_FOUND" });
  });
});
