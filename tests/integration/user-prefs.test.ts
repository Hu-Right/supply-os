/**
 * API 集成测试 — 用户行业偏好
 * Integration tests for user-prefs routes via supertest
 *
 * 覆盖端点：
 *   GET  /api/user/industry-prefs — 偏好读取
 *   POST /api/user/industry-prefs — 偏好保存/清除
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createUserPrefsRouter } from "../../server/routes/user-prefs.routes";
import { notFoundHandler, errorHandler } from "../../server/middleware/errorHandler";
import { optionalAuth } from "../../server/middleware/auth";
import type { AppContext } from "./helpers";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock search cache invalidation ──
vi.mock("../../server/services/search-orchestrator/index", () => ({
  invalidateUnifiedSearchCache: vi.fn(),
}));

function createTestApp(userPrefsRepo: any) {
  const app = express();
  app.use(express.json());
  app.use(optionalAuth);
  const ctx = {
    user: { userPrefsRepo },
  } as unknown as AppContext;
  app.use(createUserPrefsRouter(ctx));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("API 集成测试 — /api/user/industry-prefs", () => {
  let request: supertest.Agent;
  const mockUserPrefsRepo = {
    getIndustryPrefs: vi.fn(),
    upsertIndustryPrefs: vi.fn(),
    deleteIndustryPrefs: vi.fn(),
  };

  beforeAll(() => {
    const app = createTestApp(mockUserPrefsRepo);
    request = supertest.agent(app);
  });

  // ── GET ──
  describe("GET /api/user/industry-prefs", () => {
    it("未认证 → 401", async () => {
      const res = await request.get("/api/user/industry-prefs");
      expect(res.status).toBe(401);
    });

    it("已认证 + 有偏好 → 返回偏好数据", async () => {
      mockUserPrefsRepo.getIndustryPrefs.mockResolvedValue({
        level1_id: 10, level2_id: 20, level3_id: null, level4_id: null, level5_id: null,
      });
      const res = await request.get("/api/user/industry-prefs").set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("prefs");
      expect(res.body.prefs.level1_id).toBe(10);
    });

    it("已认证 + 无偏好 → 返回 null", async () => {
      mockUserPrefsRepo.getIndustryPrefs.mockResolvedValue(null);
      const res = await request.get("/api/user/industry-prefs").set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.prefs).toBeNull();
    });
  });

  // ── POST ──
  describe("POST /api/user/industry-prefs", () => {
    it("未认证 → 401", async () => {
      const res = await request.post("/api/user/industry-prefs").send({ level1_id: 10 });
      expect(res.status).toBe(401);
    });

    it("已认证 + level1_id=0 → 清除偏好", async () => {
      mockUserPrefsRepo.deleteIndustryPrefs.mockResolvedValue(undefined);
      const res = await request
        .post("/api/user/industry-prefs")
        .set(AUTH_HEADER)
        .send({ level1_id: 0 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleared).toBe(true);
      expect(mockUserPrefsRepo.deleteIndustryPrefs).toHaveBeenCalled();
    });

    it("已认证 + 有效层级 → 保存偏好", async () => {
      mockUserPrefsRepo.upsertIndustryPrefs.mockResolvedValue(undefined);
      const res = await request
        .post("/api/user/industry-prefs")
        .set(AUTH_HEADER)
        .send({ level1_id: 10, level2_id: 20, level3_id: 30 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockUserPrefsRepo.upsertIndustryPrefs).toHaveBeenCalledWith(
        "test@example.com",
        [10, 20, 30, null, null]
      );
    });

    it("非整数层级值 → 归为 null", async () => {
      mockUserPrefsRepo.upsertIndustryPrefs.mockResolvedValue(undefined);
      const res = await request
        .post("/api/user/industry-prefs")
        .set(AUTH_HEADER)
        .send({ level1_id: 10, level2_id: -1, level3_id: 0 });
      expect(res.status).toBe(201);
      expect(mockUserPrefsRepo.upsertIndustryPrefs).toHaveBeenCalledWith(
        "test@example.com",
        [10, null, null, null, null]
      );
    });
  });
});
