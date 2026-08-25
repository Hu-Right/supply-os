/**
 * API 集成测试 — 线索域 + 商机域 + 类目域 + 偏好域 + AI 匹配
 * Integration tests for leads/opportunities/catalog/user-prefs/ai routes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import supertest from "supertest";
import { createMockContext, createTestApp } from "./helpers";
import type { AppContext } from "./helpers";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock leads 服务 ──
vi.mock("../../server/services/leads", () => ({
  mapUngmAppointmentRow: vi.fn((row: any) => ({ ...row, id: row.id || row.lead_id })),
  insertUngmAppointment: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock UNSPSC 服务 ──
vi.mock("../../server/services/unspsc/index", () => ({
  normalizeUnspscCodes: vi.fn((codes: any) => codes || []),
  persistUserInterestCodes: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock 翻译服务 ──
vi.mock("../../server/services/translation/notice", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: "Simplified Chinese", en: "English" },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
}));

vi.mock("../../server/services/translation/chain", () => ({
  translateViaChain: vi.fn(),
}));

// ── Mock 搜索缓存 ──
vi.mock("../../server/services/search-orchestrator/index", () => ({
  invalidateUnifiedSearchCache: vi.fn(),
}));

import { createLeadsRouter } from "../../server/routes/leads.routes";
import { createOpportunitiesRouter } from "../../server/routes/opportunities.routes";
import { createCatalogRouter } from "../../server/routes/catalog.routes";
import { createUserPrefsRouter } from "../../server/routes/user-prefs.routes";
import { createAiRouter } from "../../server/routes/ai.routes";

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — POST /api/leads（创建线索）", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      leadsRepo: {
        listAppointments: vi.fn().mockResolvedValue([]),
        findByKey: vi.fn(),
        updateFollowUpLogs: vi.fn(),
      },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createLeadsRouter, ctx);
    const res = await supertest(app).post("/api/leads").send({});
    expect(res.status).toBe(401);
  });

  it("缺少必填字段 → 400", async () => {
    const app = createTestApp(createLeadsRouter, ctx);
    const res = await supertest(app)
      .post("/api/leads")
      .set(AUTH_HEADER)
      .send({ companyName: "", contactPerson: "" });
    expect(res.status).toBe(400);
  });

  it("有效线索 → 201", async () => {
    const app = createTestApp(createLeadsRouter, ctx);
    const res = await supertest(app)
      .post("/api/leads")
      .set(AUTH_HEADER)
      .send({
        companyName: "Test Corp",
        contactPerson: "John",
        contactMethod: "email@test.com",
        type: "consulting_advisor",
      });
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("Test Corp");
  });
});

describe("集成测试 — GET /api/leads（管理员列表）", () => {
  it("无管理员密钥 → 503/403", async () => {
    const ctx = createMockContext({
      leadsRepo: { listAppointments: vi.fn().mockResolvedValue([]), findByKey: vi.fn(), updateFollowUpLogs: vi.fn() },
    });
    const origToken = process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_API_TOKEN;
    const app = createTestApp(createLeadsRouter, ctx);
    const res = await supertest(app).get("/api/leads");
    // 无 ADMIN_API_TOKEN → 503
    expect([403, 503]).toContain(res.status);
    process.env.ADMIN_API_TOKEN = origToken;
  });

  it("有管理员密钥 → 200", async () => {
    const ctx = createMockContext({
      leadsRepo: {
        listAppointments: vi.fn().mockResolvedValue([{ id: "lead-1", company_name: "Corp" }]),
        findByKey: vi.fn(),
        updateFollowUpLogs: vi.fn(),
      },
    });
    const origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = "admin-secret";
    const app = createTestApp(createLeadsRouter, ctx);
    const res = await supertest(app).get("/api/leads").set("x-admin-token", "admin-secret");
    expect(res.status).toBe(200);
    process.env.ADMIN_API_TOKEN = origToken;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITIES 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — GET /api/opportunities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("→ 200 商机列表（公开）", async () => {
    const ctx = createMockContext({
      opportunitiesRepo: {
        listOpportunities: vi.fn().mockResolvedValue([
          { id: 1, title: "Opp 1", unspsc_codes: ["42"] },
        ]),
        listUnlocks: vi.fn(),
        findTranslationCache: vi.fn(),
        findTextById: vi.fn(),
        upsertTranslation: vi.fn(),
        insertView: vi.fn(),
        incrementViewCount: vi.fn(),
        findExistingUnlock: vi.fn(),
        findById: vi.fn(),
        insertUnlock: vi.fn(),
        incrementUnlockCount: vi.fn(),
      },
    });
    const app = createTestApp(createOpportunitiesRouter, ctx);
    const res = await supertest(app).get("/api/opportunities");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("集成测试 — POST /api/opportunities/:id/view", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      opportunitiesRepo: {
        listOpportunities: vi.fn(),
        listUnlocks: vi.fn(),
        findTranslationCache: vi.fn(),
        findTextById: vi.fn(),
        upsertTranslation: vi.fn(),
        insertView: vi.fn().mockResolvedValue(undefined),
        incrementViewCount: vi.fn().mockResolvedValue(undefined),
        findExistingUnlock: vi.fn(),
        findById: vi.fn(),
        insertUnlock: vi.fn(),
        incrementUnlockCount: vi.fn(),
      },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createOpportunitiesRouter, ctx);
    const res = await supertest(app).post("/api/opportunities/1/view");
    expect(res.status).toBe(401);
  });

  it("有 JWT → 200 浏览计数", async () => {
    const app = createTestApp(createOpportunitiesRouter, ctx);
    const res = await supertest(app).post("/api/opportunities/1/view").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("集成测试 — GET /api/opportunities/unlocks", () => {
  it("有 JWT → 200 解锁列表", async () => {
    const ctx = createMockContext({
      opportunitiesRepo: {
        listOpportunities: vi.fn(),
        listUnlocks: vi.fn().mockResolvedValue([{ opportunity_id: 1 }]),
        findTranslationCache: vi.fn(),
        findTextById: vi.fn(),
        upsertTranslation: vi.fn(),
        insertView: vi.fn(),
        incrementViewCount: vi.fn(),
        findExistingUnlock: vi.fn(),
        findById: vi.fn(),
        insertUnlock: vi.fn(),
        incrementUnlockCount: vi.fn(),
      },
    });
    const app = createTestApp(createOpportunitiesRouter, ctx);
    const res = await supertest(app).get("/api/opportunities/unlocks").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOG 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Catalog 端点", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      catalogRepo: {
        listActiveCertifications: vi.fn().mockResolvedValue([{ id: 1, name: "ISO 9001" }]),
        listUnspscWithTranslation: vi.fn().mockResolvedValue([
          { id: 10, title: "Manufacturing", code: "10000000", level: 1 },
        ]),
        searchUnspsc: vi.fn().mockResolvedValue([]),
        smartInferUnspsc: vi.fn().mockResolvedValue({ best: null, candidates: [] }),
        upsertUnspscTranslations: vi.fn(),
      },
    });
  });

  it("GET /api/certifications → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/certifications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /api/unspsc/industries → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/industries");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.headers["cache-control"]).toContain("max-age=600");
  });

  it("GET /api/unspsc/children?parent_id=10 → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/children?parent_id=10");
    expect(res.status).toBe(200);
  });

  it("GET /api/unspsc/children（缺 parent_id）→ 400", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/children");
    expect(res.status).toBe(400);
  });

  it("GET /api/unspsc/search?q=ma → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/search?q=ma");
    expect(res.status).toBe(200);
  });

  it("GET /api/unspsc/search?q=a（太短）→ 200 空数组", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /api/unspsc/smart-infer?q=steel → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/unspsc/smart-infer?q=steel");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("result");
    expect(res.body).toHaveProperty("candidates");
  });

  it("GET /api/catalog/country-name-map → 200", async () => {
    const app = createTestApp(createCatalogRouter, ctx);
    const res = await supertest(app).get("/api/catalog/country-name-map");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("countryNameZh");
    expect(res.body).toHaveProperty("regionNameZh");
    expect(res.body).toHaveProperty("zhToEn");
    expect(res.headers["cache-control"]).toContain("max-age=86400");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER-PREFS 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — User Prefs 端点", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      userPrefsRepo: {
        getIndustryPrefs: vi.fn().mockResolvedValue([{ level1_id: 10 }]),
        upsertIndustryPrefs: vi.fn(),
        deleteIndustryPrefs: vi.fn(),
      },
    });
  });

  it("GET /api/user/industry-prefs 无 JWT → 401", async () => {
    const app = createTestApp(createUserPrefsRouter, ctx);
    const res = await supertest(app).get("/api/user/industry-prefs");
    expect(res.status).toBe(401);
  });

  it("GET /api/user/industry-prefs 有 JWT → 200", async () => {
    const app = createTestApp(createUserPrefsRouter, ctx);
    const res = await supertest(app).get("/api/user/industry-prefs").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.prefs).toHaveLength(1);
  });

  it("POST /api/user/industry-prefs 保存偏好 → 201", async () => {
    const app = createTestApp(createUserPrefsRouter, ctx);
    const res = await supertest(app)
      .post("/api/user/industry-prefs")
      .set(AUTH_HEADER)
      .send({ level1_id: 10, level2_id: 20 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/user/industry-prefs 清除偏好 → 200", async () => {
    const app = createTestApp(createUserPrefsRouter, ctx);
    const res = await supertest(app)
      .post("/api/user/industry-prefs")
      .set(AUTH_HEADER)
      .send({ level1_id: 0 });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — POST /api/ai/matchmake", () => {
  let ctx: AppContext;
  let origApiKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    origApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY; // 确保走 fallback 路径
  });

  afterEach(() => {
    if (origApiKey !== undefined) {
      process.env.GEMINI_API_KEY = origApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createAiRouter, ctx);
    const res = await supertest(app).post("/api/ai/matchmake").send({});
    expect(res.status).toBe(401);
  });

  it("缺少参数 → 400", async () => {
    const app = createTestApp(createAiRouter, ctx);
    const res = await supertest(app)
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({ supplier: {} });
    expect(res.status).toBe(400);
  });

  it("无 GEMINI_API_KEY → fallback 本地分析", async () => {
    const app = createTestApp(createAiRouter, ctx);
    const res = await supertest(app)
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({
        supplier: { nameZh: "测试公司", mainProductsZh: ["产品A"] },
        opportunity: { titleZh: "采购公告", countryZh: "美国" },
        language: "zh",
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.analysis).toContain("匹配度");
  });

  it("英文 fallback → 200", async () => {
    const app = createTestApp(createAiRouter, ctx);
    const res = await supertest(app)
      .post("/api/ai/matchmake")
      .set(AUTH_HEADER)
      .send({
        supplier: { nameEn: "Test Co", mainProductsEn: ["Product A"] },
        opportunity: { titleEn: "Procurement Notice", countryEn: "USA" },
        language: "en",
      });
    expect(res.status).toBe(200);
    expect(res.body.modelUsed).toBe("local-match-fallback");
    expect(res.body.analysis).toContain("Matchmaking");
  });
});
