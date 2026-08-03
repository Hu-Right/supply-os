// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createNoticesRouter } from "../../../server/routes/notices.routes";
import { translateNoticeViaChain, getTranslatedNoticeDetail } from "../../../server/services/notice-translation";
import { errorHandler } from "../../../server/middleware/errorHandler";
import { NoticesRepo } from "../../../server/repos/notices.repo";
import { MembershipRepo } from "../../../server/repos/membership.repo";
import { UsersRepo } from "../../../server/repos/users.repo";
import { OpportunitiesRepo } from "../../../server/repos/opportunities.repo";

// Mock heavy dependencies to isolate route logic
const mockGetTranslatedNoticeDetail = vi.fn();
vi.mock("../../../server/services/notice-translation", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
  detectSourceLang: vi.fn(() => null),
  getTranslatedNoticeDetail: (...args: unknown[]) => mockGetTranslatedNoticeDetail(...args),
}));

function createMockCtx() {
  const dbPool = {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([]),
  };
  return {
    dbPool,
    noticesRepo: new NoticesRepo(dbPool as any),
    membershipRepo: new MembershipRepo(dbPool as any),
    usersRepo: new UsersRepo(dbPool as any),
    opportunitiesRepo: new OpportunitiesRepo(dbPool as any),
  };
}

function buildApp(ctx: any) {
  const app = express();
  app.use(express.json());
  app.use(createNoticesRouter(ctx as any));
  app.use(errorHandler);
  return app;
}

// ─── GET /api/notices ───────────────────────────────────────────────────────
describe("GET /api/notices", () => {
  it("returns paginated notice list", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 2 }]]) // COUNT
      .mockResolvedValueOnce([[ // rows
        { id: 1, title: "Notice A", notice_type: "Tender", country: "Brazil" },
        { id: 2, title: "Notice B", notice_type: "RFP", country: "India" },
      ]])
      .mockResolvedValueOnce([[]]); // documents query
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices?page=1&page_size=9");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].core_locked).toBe(true);
  });

  it("clamps page_size between 6 and 30", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices?page_size=100");
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(30);
  });

  it("applies search filter with q parameter", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1, title: "Medical Device", reference: "MED-001" }]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices?q=MED-001");
    expect(res.status).toBe(200);
    // Verify the SQL included search conditions
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    expect(countSql).toContain("UPPER(REPLACE");
  });

  it("applies country filter", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    await request(app).get("/api/notices?country=Brazil");
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    // 精确匹配（下拉值来自 GROUP BY 精确国家名），避免 LIKE 误命中包含关系国家
    expect(countSql).toContain("n.country = ?");
  });

  it("applies value_min/value_max filters with JOIN", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    await request(app).get("/api/notices?value_min=1000&value_max=50000");
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    expect(countSql).toContain("crm_notice_amount_cache");
    expect(countSql).toContain("amount_usd >= ?");
    expect(countSql).toContain("amount_usd <= ?");
  });

  it("applies deadline_within_days filter", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    await request(app).get("/api/notices?deadline_within_days=30");
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    expect(countSql).toContain("86400");
  });

  // [精选功能重新启用 2026-07-31] featured=1 三路合格机会过滤 + 页级 is_featured 标注
  it("applies featured filter and marks items as featured", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]]) // COUNT
      .mockResolvedValueOnce([[{ id: 7, title: "Qualified Notice", notice_type: "Tender" }]]) // rows
      .mockResolvedValueOnce([[]]); // documents query（featuredOnly 时跳过标注回查）
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices?featured=1");
    expect(res.status).toBe(200);
    // WHERE 包含三路合格机会 IN 子查询（converted_opp_id / source_notice_id / reference）
    const countSql = ctx.dbPool.query.mock.calls[0][0];
    expect(countSql).toContain("crm_bid_opportunities");
    expect(countSql).toContain("is_qualified = 1");
    // featuredOnly 命中的当页项全部标注 is_featured
    expect(res.body.items[0].is_featured).toBe(true);
  });

  it("returns 500 on database error", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockRejectedValue(new Error("DB connection lost"));
    const app = buildApp(ctx);
    // 带唯一 q 参数避开 searchNotices 60s TTL 缓存（与前面用例默认参数同键会命中缓存）
    const res = await request(app).get("/api/notices?q=DB_ERROR_PROBE");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB connection lost");
  });
});

// ─── GET /api/notices/countries ─────────────────────────────────────────────
describe("GET /api/notices/countries", () => {
  it("returns country list with counts", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[
      { country: "Brazil", cnt: 500 },
      { country: "India", cnt: 300 },
    ]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/countries");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ country: "Brazil", count: 500 });
  });
});

// ─── GET /api/notices/stats ─────────────────────────────────────────────────
describe("GET /api/notices/stats", () => {
  it("returns raw/active/bridged/featured/bridge_gap stats", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ total: 100000 }]]) // raw
      .mockResolvedValueOnce([[{ total: 50000 }]])  // active
      .mockResolvedValueOnce([[{ total: 30000 }]])  // bridged
      .mockResolvedValueOnce([[{ total: 5000 }]]);  // featured（[精选功能重新启用 2026-07-31] 真实计数）
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/stats");
    expect(res.status).toBe(200);
    expect(res.body.raw).toBe(100000);
    expect(res.body.active).toBe(50000);
    expect(res.body.bridged).toBe(30000);
    expect(res.body.featured).toBe(5000);
    expect(res.body.bridge_gap).toBe(20000);
  });
});

// ─── POST /api/notices/feedback ─────────────────────────────────────────────
describe("POST /api/notices/feedback", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/notices/feedback").send({
      session_id: "s1",
      actions: [{ notice_id: 1, action: "click" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("returns 400 when session_id missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/notices/feedback").send({
      user_key: "user@test.com",
      actions: [{ notice_id: 1, action: "click" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("SESSION_REQUIRED");
  });

  it("returns 400 when no valid actions", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/notices/feedback").send({
      user_key: "user@test.com",
      session_id: "s1",
      actions: [{ notice_id: 0, action: "invalid_action" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when too many actions (>50)", async () => {
    const app = buildApp(createMockCtx());
    const actions = Array.from({ length: 51 }, (_, i) => ({ notice_id: i + 1, action: "impression" }));
    const res = await request(app).post("/api/notices/feedback").send({
      user_key: "user@test.com",
      session_id: "s1",
      actions,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("TOO_MANY_ACTIONS");
  });

  it("accepts valid batch feedback and returns 201", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([{ affectedRows: 2 }]) // INSERT IGNORE
      .mockResolvedValueOnce([[]]); // notice unspsc lookup
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/feedback").send({
      user_key: "user@test.com",
      session_id: "sess-123",
      actions: [
        { notice_id: 1, action: "click", reco_score: 0.8, position: 0 },
        { notice_id: 2, action: "impression" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.received).toBe(2);
  });

  it("supports single action without actions array", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/feedback").send({
      user_key: "user@test.com",
      session_id: "s1",
      notice_id: 5,
      action: "favorite",
    });
    expect(res.status).toBe(201);
    expect(res.body.received).toBe(1);
  });
});

// ─── GET /api/notices/:id/detail ────────────────────────────────────────────
describe("GET /api/notices/:id/detail", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/notices/1/detail");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_AND_NOTICE_REQUIRED");
  });

  it("returns 403 when notice not unlocked", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]); // no unlock record
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1/detail?user_key=user@test.com");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NOTICE_LOCKED");
  });

  it("returns 404 when notice not found after unlock", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ id: 1, unlock_type: "free", unlocked_at: "2026-01-01" }]]) // unlock exists
      .mockResolvedValueOnce([[]]); // notice not found
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/999/detail?user_key=user@test.com");
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/notices/:id/translation ──────────────────────────────────────
describe("GET /api/notices/:id/translation", () => {
  beforeEach(() => {
    vi.mocked(translateNoticeViaChain).mockReset();
    mockGetTranslatedNoticeDetail.mockReset();
    // 默认委托给 translateNoticeViaChain mock，保持测试行为不变
    mockGetTranslatedNoticeDetail.mockImplementation(async (noticeId: number, lang: string, noticesRepo: any, dbPool: any) => {
      const cachedRow = await noticesRepo.findTranslationCache(noticeId, lang);
      if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
        return { lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true };
      }
      if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr) {
        const descSource = "原文描述";
        const result = await vi.mocked(translateNoticeViaChain)("", descSource, lang);
        if (result.provider === "same-lang-passthrough") {
          return { lang, title: cachedRow.title_tr, description: result.translations[1], cached: false, passthrough: true };
        }
        return { lang, title: cachedRow.title_tr, description: result.translations[1], cached: false };
      }
      const notice = await noticesRepo.findForTranslation(noticeId);
      if (!notice) throw new Error("NOTICE_NOT_FOUND");
      const result = await vi.mocked(translateNoticeViaChain)(notice.title || "", notice.description || "", lang);
      if (result.provider === "same-lang-passthrough") {
        return { lang, title: result.translations[0], description: result.translations[1], cached: false, passthrough: true };
      }
      await noticesRepo.upsertTranslation(noticeId, lang, result.translations[0], result.translations[1], result.provider);
      return { lang, title: result.translations[0], description: result.translations[1], cached: false };
    });
  });

  it("caches real translations into crm_notice_translations", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "Pump supply", description: "Supply of pumps" }]]) // notice
      .mockResolvedValue([[]]); // INSERT + 后续英文中枢查询
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["水泵供应", "供应水泵"], provider: "deepseek-v4-flash",
    });
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1001/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lang: "zh", title: "水泵供应", description: "供应水泵", cached: false });
    const insertCalls = ctx.dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_notice_translations")
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("does not cache same-lang-passthrough results", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "采购水泵", description: "采购水泵及配件" }]]); // notice
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["采购水泵", "采购水泵及配件"], provider: "same-lang-passthrough",
    });
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1002/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body.passthrough).toBe(true);
    expect(res.body.cached).toBe(false);
    const insertCalls = ctx.dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_notice_translations")
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("does not persist passthrough description on the desc-backfill branch", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ title_tr: "已有标题", description_tr: null }]]) // 缓存行缺 desc
      // 源码 SQL 用 `SELECT n.description AS notice_desc`，mock 须返回别名形状；
      // converted_opp_id/notice_id/reference 置空使 findQualifiedOpportunityForNotice 不发起查询
      .mockResolvedValueOnce([[{ notice_desc: "原文描述", converted_opp_id: null, notice_id: null, reference: null }]]);
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["", "原文描述"], provider: "same-lang-passthrough",
    });
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1003/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body.passthrough).toBe(true);
    const updateCalls = ctx.dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("UPDATE crm_notice_translations")
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 503 JSON when translation chain unavailable", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "T", description: "D" }]]);
    vi.mocked(translateNoticeViaChain).mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1004/translation?lang=zh");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "TRANSLATION_UNAVAILABLE" });
  });
});

// ─── POST /api/notices/:id/unlock ───────────────────────────────────────────
describe("POST /api/notices/:id/unlock", () => {
  it("returns alreadyUnlocked for duplicate unlock", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[{ id: 1 }]]); // existing unlock
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/1/unlock").send({
      user_key: "user@test.com",
      unlock_type: "free",
    });
    expect(res.status).toBe(200);
    expect(res.body.alreadyUnlocked).toBe(true);
  });

  it("returns 402 when free quota exhausted", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no existing unlock
      .mockResolvedValueOnce([[{ free_quota: 3 }]]) // plan quota
      .mockResolvedValueOnce([[{ total: 3 }]]); // used count = quota
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/1/unlock").send({
      user_key: "user@test.com",
      unlock_type: "free",
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("FREE_LIMIT_REACHED");
  });

  it("returns 404 when notice not found", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no existing unlock
      .mockResolvedValueOnce([[{ free_quota: 3 }]])
      .mockResolvedValueOnce([[{ total: 0 }]]) // used count
      .mockResolvedValueOnce([[]]); // notice not found
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/999/unlock").send({
      user_key: "user@test.com",
      unlock_type: "free",
    });
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/notices/:id/view ─────────────────────────────────────────────
describe("POST /api/notices/:id/view", () => {
  it("records view and returns success", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/42/view").send({ user_key: "user@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(ctx.dbPool.execute).toHaveBeenCalledTimes(1);
  });
});

// ─── POST /api/notices/:id/interest ─────────────────────────────────────────
describe("POST /api/notices/:id/interest", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/notices/1/interest").send({ interest_type: "interested" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("returns 404 when notice not found", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/notices/999/interest").send({
      user_key: "user@test.com",
      interest_type: "interested",
    });
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/notices/:id/report（中文版订单拆解报告）─────────────────
describe("GET /api/notices/:id/report", () => {
  /** 二进制响应收集器：supertest 对 docx MIME 默认不缓冲 body */
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  };

  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/notices/1/report");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_AND_NOTICE_REQUIRED");
  });

  it("returns 403 when notice not unlocked", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[]]); // no unlock record
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/1/report?user_key=user@test.com");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NOTICE_LOCKED");
  });

  it("returns 404 when no qualified opportunity exists", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ id: 1 }]]) // unlock exists
      // notice 无 converted_opp_id/notice_id/reference → 三路匹配直接落空
      .mockResolvedValueOnce([[{ id: 43, title: "No opp notice" }]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/notices/43/report?user_key=user@test.com");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("REPORT_NOT_AVAILABLE");
  });

  it("streams a docx attachment for qualified opportunity", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[{ id: 1 }]]) // unlock exists
      .mockResolvedValueOnce([[{ id: 42, title: "Handball", reference: "REF-1", converted_opp_id: 7 }]]) // notice
      .mockResolvedValueOnce([[{ id: 7, is_qualified: 1, title: "Handball Opp", reference: "REF-1" }]]) // 合格 opp（converted_opp_id 路）
      .mockResolvedValueOnce([[{ // SELECT * 全列回查
        id: 7, update_time: "2026-01-01 00:00:00", title: "Handball Opp", reference: "REF-1",
        description_cn: "中文拆解内容", bid_overview: "概览", incoterms: "DDP",
      }]]);
    const app = buildApp(ctx);
    const res = await request(app)
      .get("/api/notices/42/report?user_key=user@test.com")
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("wordprocessingml");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
    // docx 本质是 zip：魔数 PK
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
