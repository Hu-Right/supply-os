// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../../server/routes/opportunities.routes";
import { translateNoticeViaChain } from "../../../server/services/notice-translation";

// 与 notices-routes 测试同款隔离：整体 mock 翻译入口
vi.mock("../../../server/services/notice-translation", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
  detectSourceLang: vi.fn(() => null),
}));

function createMockCtx() {
  return {
    dbPool: {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn().mockResolvedValue([]),
    },
  };
}

function buildApp(ctx: any) {
  const app = express();
  app.use(express.json());
  app.use(createOpportunitiesRouter(ctx as any));
  return app;
}

// ─── GET /api/opportunities/:id/translation ────────────────────────────────
describe("GET /api/opportunities/:id/translation", () => {
  beforeEach(() => {
    vi.mocked(translateNoticeViaChain).mockReset();
  });

  it("translates opportunity content on demand and caches it", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "Fourniture de pompes", description: "Fourniture de pompes hydrauliques" }]]) // opportunity
      .mockResolvedValue([[]]); // INSERT
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["水泵供应", "供应液压水泵"], provider: "youdao-llm",
    });
    const app = buildApp(ctx);
    const res = await request(app).get("/api/opportunities/2001/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lang: "zh", title: "水泵供应", description: "供应液压水泵", cached: false });
    const inserts = ctx.dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_opportunity_translations")
    );
    expect(inserts).toHaveLength(1);
  });

  it("returns cached translation without calling the chain", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query.mockResolvedValueOnce([[{ title_tr: "水泵供应", description_tr: "供应液压水泵" }]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/opportunities/2002/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lang: "zh", title: "水泵供应", description: "供应液压水泵", cached: true });
    expect(translateNoticeViaChain).not.toHaveBeenCalled();
  });

  it("does not cache same-lang-passthrough results", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "采购水泵", description: "采购水泵及配件" }]]); // opportunity
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["采购水泵", "采购水泵及配件"], provider: "same-lang-passthrough",
    });
    const app = buildApp(ctx);
    const res = await request(app).get("/api/opportunities/2003/translation?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body.passthrough).toBe(true);
    expect(res.body.cached).toBe(false);
    const inserts = ctx.dbPool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_opportunity_translations")
    );
    expect(inserts).toHaveLength(0);
  });

  it("returns 503 JSON when chain unavailable", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[{ title: "T", description: "D" }]]);
    vi.mocked(translateNoticeViaChain).mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
    const app = buildApp(ctx);
    const res = await request(app).get("/api/opportunities/2004/translation?lang=zh");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "TRANSLATION_UNAVAILABLE" });
  });

  it("returns 400 for unsupported lang", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/opportunities/2005/translation?lang=xx");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_OPPORTUNITY_OR_LANG");
  });

  it("returns 404 when opportunity not found", async () => {
    const ctx = createMockCtx();
    ctx.dbPool.query
      .mockResolvedValueOnce([[]]) // no cached row
      .mockResolvedValueOnce([[]]); // opportunity missing
    const app = buildApp(ctx);
    const res = await request(app).get("/api/opportunities/9999/translation?lang=zh");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("OPPORTUNITY_NOT_FOUND");
  });
});
