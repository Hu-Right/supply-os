/**
 * API 集成测试 — 公告域：详情 / 内容 / 预览 / 翻译
 * Integration tests for notices/detail routes via supertest
 *
 * 覆盖端点：
 *   GET /api/notices/:id/detail       — 公告详情（需解锁）
 *   GET /api/notices/:id/content      — 公告全文（未解锁截断 300 字）
 *   GET /api/notices/:id/preview      — 锁定态预览（敏感度分级）
 *   GET /api/notices/:id/translation  — 公告翻译
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import { createMockContext, createTestApp } from "../helpers";
import type { AppContext } from "../helpers";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── Mock JWT（requireAuth 中间件依赖）──
vi.mock("../../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "test@example.com" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock 服务模块 ──
vi.mock("../../../server/services/notices/index", () => ({
  normalizeNoticeDetailPayload: vi.fn(),
  findQualifiedOpportunityForNotice: vi.fn(),
}));

vi.mock("../../../server/services/unspsc/index", () => ({
  normalizeUnspscCodes: vi.fn((codes: any) => codes || []),
}));

vi.mock("../../../server/services/translation/notice", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: "Simplified Chinese", en: "English", fr: "French" },
  getTranslatedNoticeDetail: vi.fn(),
  detectSourceLang: vi.fn().mockReturnValue(null),
  translateNoticeViaChain: vi.fn(),
}));

vi.mock("../../../server/services/search-sync/index", () => ({
  syncWideIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: vi.fn().mockReturnValue([]),
}));

import { createNoticeDetailRouter } from "../../../server/routes/notices/detail.routes";

// ── GET /api/notices/:id/detail ──
describe("集成测试 — GET /api/notices/:id/detail", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeUnlockRepo: { findUnlock: vi.fn() },
      noticeDetailRepo: { findDetail: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/detail");
    expect(res.status).toBe(401);
  });

  it("已解锁 + 公告存在 → 200 详情", async () => {
    const { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } =
      await import("../../../server/services/notices/index");
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1, user_key: "test@example.com" });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1, title: "Test Notice" });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue(null);
    (normalizeNoticeDetailPayload as any).mockReturnValue({ id: 1, title: "Test Notice", unlocked: true });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/detail").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("未解锁 → 403 NOTICE_LOCKED", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue(null);
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1, title: "Test" });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/detail").set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(40023);
    expect(res.body.core_locked).toBe(true);
  });

  it("公告不存在 → 404", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 999 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/999/detail").set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(40004);
  });
});

// ── GET /api/notices/:id/content ──
describe("集成测试 — GET /api/notices/:id/content", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeUnlockRepo: { findUnlock: vi.fn() },
      noticeDetailRepo: { findDetail: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/content");
    expect(res.status).toBe(401);
  });

  it("已解锁 → 返回完整 description", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices/index");
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({
      id: 1, title: "Test", description: "Full description text here",
    });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue(null);
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/content").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Full description text here");
    expect(res.body.title).toBe("Test");
  });

  it("未解锁 → description 截断 300 字", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices/index");
    const longDesc = "A".repeat(500);
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({
      id: 1, title: "Test", description: longDesc,
    });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue(null);
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/content").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.description).toHaveLength(300);
    expect(res.body.description_cn).toBe("");
  });

  it("公告不存在 → 404", async () => {
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/999/content").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/notices/:id/preview ──
describe("集成测试 — GET /api/notices/:id/preview", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeDetailRepo: { findPreview: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/preview");
    expect(res.status).toBe(401);
  });

  it("公告存在 → 200 预览数据", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices/index");
    (ctx.notice.detailRepo.findPreview as any).mockResolvedValue({
      id: 1, title: "Test", agency: "USAID", description: "Desc",
      unspsc_codes: null, contacts: null, key_contacts: null,
    });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue({
      id: 1, agency_full: "US Agency for International Development",
      published_date: "2026-01-01", difficulty: "medium",
      registration_level: "low", unspsc_codes: null,
    });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/preview").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.agency).toBe("USAID");
    expect(res.body.agency_full).toBe("US Agency for International Development");
    expect(res.body).toHaveProperty("contact_count");
    expect(res.body).toHaveProperty("report_available");
  });

  it("公告不存在 → 404", async () => {
    (ctx.notice.detailRepo.findPreview as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/999/preview").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/notices/:id/translation ──
describe("集成测试 — GET /api/notices/:id/translation", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeDetailRepo: { findDetail: vi.fn() },
      noticeTranslationRepo: {
        findTranslationCache: vi.fn().mockResolvedValue(null),
        upsertTranslation: vi.fn(),
      },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=en");
    expect(res.status).toBe(401);
  });

  it("无效 lang → 400", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=xx").set(AUTH_HEADER);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40025);
  });

  it("缺少 lang → 400", async () => {
    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation").set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it("zh 快速路径：description_cn + 缓存标题 → 200", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices/index");
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({
      id: 1, title: "English Title", description: "English desc",
    });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue({
      id: 1, description_cn: "中文描述内容",
    });
    (ctx.notice.translationRepo.findTranslationCache as any).mockResolvedValue({
      title_tr: "英文标题",
    });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=zh").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe("zh");
    expect(res.body.description).toBe("中文描述内容");
    expect(res.body.title).toBe("英文标题");
    expect(res.body.cached).toBe(true);
    expect(res.body.source).toBe("description_cn");
  });

  it("通用翻译路径 → 200", async () => {
    const { getTranslatedNoticeDetail } = await import("../../../server/services/translation/notice");
    (getTranslatedNoticeDetail as any).mockResolvedValue({
      lang: "en", title: "Translated Title", description: "Translated desc",
      cached: false,
    });

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=en").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe("en");
    expect(res.body.title).toBe("Translated Title");
  });

  it("翻译不可用 → 503", async () => {
    const { getTranslatedNoticeDetail } = await import("../../../server/services/translation/notice");
    (getTranslatedNoticeDetail as any).mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=fr").set(AUTH_HEADER);
    expect(res.status).toBe(503);
  });

  it("公告不存在 → 404", async () => {
    const { getTranslatedNoticeDetail } = await import("../../../server/services/translation/notice");
    (getTranslatedNoticeDetail as any).mockRejectedValue(new Error("NOTICE_NOT_FOUND"));

    const app = createTestApp(createNoticeDetailRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/translation?lang=en").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});
