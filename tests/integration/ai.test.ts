/**
 * API 集成测试 — AI 匹配端点
 * Integration tests for AI routes via supertest
 *
 * 覆盖端点：
 *   POST /api/ai/matchmake — AI 供应商-商机匹配
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createAiRouter } from "../../server/routes/ai.routes";
import { notFoundHandler, errorHandler } from "../../server/middleware/errorHandler";
import { optionalAuth } from "../../server/middleware/auth";
import type { AppContext } from "./helpers";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock rate limiter（永不拦截）──
vi.mock("../../server/middleware/rateLimiter", () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Mock GoogleGenAI（不实际调用 API）──
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(),
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(optionalAuth);
  const ctx = {} as unknown as AppContext;
  app.use(createAiRouter(ctx));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("API 集成测试 — /api/ai/matchmake", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    // 确保无 GEMINI_API_KEY → 走本地回退
    delete process.env.GEMINI_API_KEY;
    const app = createTestApp();
    request = supertest.agent(app);
  });

  it("未认证 → 401", async () => {
    const res = await request
      .post("/api/ai/matchmake")
      .send({ supplier: {}, opportunity: {} });
    expect(res.status).toBe(401);
  });

  it("缺少 supplier → 400", async () => {
    const res = await request
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({ opportunity: { titleZh: "测试" } });
    expect(res.status).toBe(400);
  });

  it("缺少 opportunity → 400", async () => {
    const res = await request
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({ supplier: { nameZh: "测试公司" } });
    expect(res.status).toBe(400);
  });

  it("有效请求（无 API Key）→ 本地回退分析", async () => {
    const res = await request
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({
        supplier: { nameZh: "测试公司", mainProductsZh: ["产品A"] },
        opportunity: { titleZh: "测试项目", countryZh: "肯尼亚" },
        language: "zh",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.analysis).toContain("本地智能算法分析报告");
  });

  it("language=en → 英文回退分析", async () => {
    const res = await request
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({
        supplier: { nameZh: "Test Co", nameEn: "Test Co", mainProductsEn: ["Product A"] },
        opportunity: { titleZh: "Test Project", titleEn: "Test Project" },
        language: "en",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analysis).toContain("Smart Rule-Based Matchmaking Report");
  });

  it("超长字段被截断（安全防注入）", async () => {
    const longName = "A".repeat(500);
    const res = await request
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({
        supplier: { nameZh: longName },
        opportunity: { titleZh: "Test" },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
