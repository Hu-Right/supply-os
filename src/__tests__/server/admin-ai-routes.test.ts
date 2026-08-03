// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createAdminRouter } from "../../../server/routes/admin.routes";
import { createAiRouter } from "../../../server/routes/ai.routes";
import { syncUnspscBridgeFull, captureDataQualitySnapshot } from "../../../server/services/quality";
import { backfillUnspscCodeIds } from "../../../server/db/backfills";
import { backfillNoticeAmountCache, rollupNoticeViewDaily, AMOUNT_PARSE_VERSION } from "../../../server/services/amount";
import { GoogleGenAI } from "@google/genai";

vi.mock("../../../server/services/quality", () => ({
  syncUnspscBridgeFull: vi.fn().mockResolvedValue(undefined),
  captureDataQualitySnapshot: vi.fn(),
}));
vi.mock("../../../server/db/backfills", () => ({
  backfillUnspscCodeIds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../server/services/amount", () => ({
  AMOUNT_PARSE_VERSION: 9,
  backfillNoticeAmountCache: vi.fn(),
  rollupNoticeViewDaily: vi.fn(),
}));
vi.mock("../../../server/services/recommend", () => ({
  AB_TREATMENT_PCT: 50,
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(),
}));

function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([result]);
    }),
    execute: vi.fn().mockResolvedValue([{}]),
  } as any;
}

function buildApp(createRouter: (ctx: any) => any, dbPool: any) {
  const app = express();
  app.use(express.json());
  app.use(createRouter({ dbPool } as any));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── POST /api/admin/sync-bridge（requireAdmin 鉴权）────────────────────────
describe("admin auth + sync-bridge", () => {
  it("returns 503 fail-closed when ADMIN_API_TOKEN not configured", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "");
    const app = buildApp(createAdminRouter, createPool());
    const res = await request(app).post("/api/admin/sync-bridge").set("x-admin-token", "anything");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when token missing or wrong", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "secret-token");
    const app = buildApp(createAdminRouter, createPool());
    expect((await request(app).post("/api/admin/sync-bridge")).status).toBe(401);
    expect((await request(app).post("/api/admin/sync-bridge").set("x-admin-token", "wrong")).status).toBe(401);
    expect(syncUnspscBridgeFull).not.toHaveBeenCalled();
  });

  it("accepts x-admin-token and triggers background backfill", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "secret-token");
    const app = buildApp(createAdminRouter, createPool());
    const res = await request(app).post("/api/admin/sync-bridge").set("x-admin-token", "secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    await vi.waitFor(() => {
      expect(syncUnspscBridgeFull).toHaveBeenCalledTimes(2); // notice + opportunity
      expect(backfillUnspscCodeIds).toHaveBeenCalledTimes(1);
    });
  });

  it("accepts Authorization Bearer header", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "secret-token");
    const app = buildApp(createAdminRouter, createPool());
    const res = await request(app)
      .post("/api/admin/sync-bridge")
      .set("Authorization", "Bearer secret-token");
    expect(res.status).toBe(200);
  });
});

// ─── 质量快照 ────────────────────────────────────────────────────────────────
describe("quality snapshot endpoints", () => {
  it("POST captures snapshot and returns metrics", async () => {
    const metrics = { total_notices: 100, missing_value: 2 };
    vi.mocked(captureDataQualitySnapshot).mockResolvedValue(metrics as any);
    const app = buildApp(createAdminRouter, createPool());
    const res = await request(app).post("/api/admin/quality-snapshot");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, metrics });
  });

  it("POST returns 500 when capture fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(captureDataQualitySnapshot).mockRejectedValue(new Error("boom"));
    const app = buildApp(createAdminRouter, createPool());
    const res = await request(app).post("/api/admin/quality-snapshot");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("质量快照采集失败");
    warnSpy.mockRestore();
  });

  it("GET clamps days range and returns snapshots", async () => {
    const pool = createPool([[{ snapshot_date: "2026-08-01", total_notices: 10 }]]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).get("/api/admin/quality-snapshot?days=9999");
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toHaveLength(1);
    expect(pool.query.mock.calls[0][1]).toEqual([365]); // 上限钳制
  });
});

// ─── POST /api/admin/backfill-amounts ───────────────────────────────────────
describe("POST /api/admin/backfill-amounts", () => {
  it("stops early when a batch is under 2000 rows", async () => {
    vi.mocked(backfillNoticeAmountCache).mockResolvedValue({ processed: 500 } as any);
    const pool = createPool([[{ remaining: 12 }]]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).post("/api/admin/backfill-amounts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, processed: 500, remaining: 12 });
    expect(backfillNoticeAmountCache).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([AMOUNT_PARSE_VERSION]);
  });

  it("keeps running while batches are full", async () => {
    vi.mocked(backfillNoticeAmountCache)
      .mockResolvedValueOnce({ processed: 2000 } as any)
      .mockResolvedValueOnce({ processed: 2000 } as any)
      .mockResolvedValueOnce({ processed: 300 } as any);
    const pool = createPool([[{ remaining: 0 }]]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).post("/api/admin/backfill-amounts");
    expect(res.body.processed).toBe(4300);
    expect(backfillNoticeAmountCache).toHaveBeenCalledTimes(3);
  });
});

// ─── POST /api/admin/rollup-views ───────────────────────────────────────────
describe("POST /api/admin/rollup-views", () => {
  it("aggregates daily views and reports stats", async () => {
    vi.mocked(rollupNoticeViewDaily).mockResolvedValue({ affected: 5 } as any);
    const pool = createPool([[{ rows_total: 100, latest_day: "2026-08-01" }]]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).post("/api/admin/rollup-views?since_days=7");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, affected: 5, rows_total: 100, latest_day: "2026-08-01" });
    expect(rollupNoticeViewDaily).toHaveBeenCalledWith(pool, 7);
  });
});

// ─── GET /api/admin/reco-ab-metrics ─────────────────────────────────────────
describe("GET /api/admin/reco-ab-metrics", () => {
  it("returns variant metrics with clamped window and treatment pct", async () => {
    const variants = [{ variant: "control", ctr: 0.5 }];
    const pool = createPool([variants]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).get("/api/admin/reco-ab-metrics?since_days=7");
    expect(res.status).toBe(200);
    expect(res.body.since_days).toBe(7);
    expect(res.body.treatment_pct).toBe(50);
    expect(res.body.variants).toEqual(variants);
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });
});

// ─── GET /api/procurement/schema-status ─────────────────────────────────────
describe("GET /api/procurement/schema-status", () => {
  it("reports table existence, row counts and missing columns", async () => {
    const pool = createPool([
      [{ table_name: "crm_users" }], // INFORMATION_SCHEMA.TABLES
      [
        { table_name: "crm_users", column_name: "user_key" },
        { table_name: "crm_users", column_name: "email" },
      ], // INFORMATION_SCHEMA.COLUMNS
      [{ total: 7 }], // COUNT(*) FROM crm_users
    ]);
    const app = buildApp(createAdminRouter, pool);
    const res = await request(app).get("/api/procurement/schema-status");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const users = res.body.tables.find((t: any) => t.table === "crm_users");
    expect(users.exists).toBe(true);
    expect(users.row_count).toBe(7);
    expect(users.column_count).toBe(2);
    expect(users.missing_columns).toContain("display_name");
    expect(users.missing_columns).not.toContain("user_key");

    const plans = res.body.tables.find((t: any) => t.table === "crm_membership_plans");
    expect(plans.exists).toBe(false);
    expect(plans.row_count).toBeNull();
    expect(plans.missing_columns).toContain("plan_code");
  });
});

// ─── POST /api/ai/matchmake ─────────────────────────────────────────────────
describe("POST /api/ai/matchmake", () => {
  const supplier = {
    nameZh: "测试供应商",
    nameEn: "Test Supplier",
    mainProductsZh: ["机床"],
    mainProductsEn: ["Machine tools"],
    complianceLabelsZh: ["ISO9001"],
    complianceLabelsEn: ["ISO9001"],
    cityZh: "苏州",
    contactPerson: "张三",
    contactEmail: "zhang@test.com",
    type: "domestic",
    industryZh: "机械",
    industryEn: "Machinery",
    countryZh: "中国",
  };
  const opportunity = {
    titleZh: "机床采购",
    titleEn: "Machine tools procurement",
    budget: "100万",
    countryZh: "德国",
    countryEn: "Germany",
    deadline: "2026-09-01",
    industryZh: "机械",
    industryEn: "Machinery",
    descriptionZh: "desc",
    descriptionEn: "desc",
  };

  it("returns 400 when supplier or opportunity missing", async () => {
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app).post("/api/ai/matchmake").send({ supplier });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("supplier and opportunity");
  });

  it("falls back to local zh report when API key missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app).post("/api/ai/matchmake").send({ supplier, opportunity });
    expect(res.status).toBe(200);
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.success).toBe(true);
    expect(res.body.analysis).toContain("本地智能算法分析报告");
    expect(res.body.analysis).toContain("测试供应商");
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("treats placeholder key as missing and honors language=en", async () => {
    vi.stubEnv("GEMINI_API_KEY", "MY_GEMINI_API_KEY");
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app)
      .post("/api/ai/matchmake")
      .send({ supplier, opportunity, language: "en" });
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.analysis).toContain("Smart Rule-Based Matchmaking Report");
  });

  it("uses Gemini response when the call succeeds", async () => {
    vi.stubEnv("GEMINI_API_KEY", "real-key");
    // 普通函数才能被 new（箭头函数不是构造器）
    vi.mocked(GoogleGenAI).mockImplementation(
      function () {
        return { models: { generateContent: vi.fn().mockResolvedValue({ text: "AI 深度分析" }) } };
      } as any
    );
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app).post("/api/ai/matchmake").send({ supplier, opportunity });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ analysis: "AI 深度分析", modelUsed: "gemini-3.5-flash", success: true });
  });

  it("falls back to local report when Gemini returns empty text", async () => {
    vi.stubEnv("GEMINI_API_KEY", "real-key");
    vi.mocked(GoogleGenAI).mockImplementation(
      function () {
        return { models: { generateContent: vi.fn().mockResolvedValue({ text: "" }) } };
      } as any
    );
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app).post("/api/ai/matchmake").send({ supplier, opportunity });
    expect(res.body.modelUsed).toBe("gemini-3.5-flash");
    expect(res.body.analysis).toContain("本地智能算法分析报告");
  });

  it("falls back with a note when Gemini call throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("GEMINI_API_KEY", "real-key");
    vi.mocked(GoogleGenAI).mockImplementation(
      function () {
        return { models: { generateContent: vi.fn().mockRejectedValue(new Error("quota")) } };
      } as any
    );
    const app = buildApp(createAiRouter, createPool());
    const res = await request(app).post("/api/ai/matchmake").send({ supplier, opportunity });
    expect(res.status).toBe(200);
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.analysis).toContain("Gemini api call returned an error");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
