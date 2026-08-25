/**
 * API 集成测试 — 公告域：搜索 / 国家 / 机构 / 统计
 * Integration tests for notices/search routes via supertest
 *
 * 覆盖端点：
 *   GET /api/notices/unified-search — 统一搜索
 *   GET /api/notices/countries      — 国家列表
 *   GET /api/notices/agencies       — 机构列表
 *   GET /api/notices/stats          — 统计数据
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import { createMockContext, createTestApp } from "../helpers";
import type { AppContext } from "../helpers";

// ── Mock 服务模块 ──
vi.mock("../../../server/services/search-orchestrator/index", () => ({
  searchUnified: vi.fn(),
}));

vi.mock("../../../server/services/notice-search/index", () => ({
  getNoticeCountries: vi.fn(),
  getNoticeAgencies: vi.fn(),
  getNoticeStats: vi.fn(),
}));

import { createNoticeSearchRouter } from "../../../server/routes/notices/search.routes";

const AUTH_HEADER = { Authorization: "Bearer mock-jwt" };

// ── unified-search ──
describe("集成测试 — GET /api/notices/unified-search", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext();
    const app = createTestApp(createNoticeSearchRouter, ctx);
    request = supertest.agent(app);
  });

  afterEach(() => vi.clearAllMocks());

  it("默认模式 → 200 + 搜索结果", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [{ id: 1, title: "Test Notice" }],
      total: 1, page: 1, pageSize: 9,
    });
    const res = await request.get("/api/notices/unified-search");
    expect(res.status).toBe(200);
    expect(res.body.notices).toHaveLength(1);
    expect(res.body.page_size).toBe(9);
  });

  it("mode=prefs → 200", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [], total: 0, page: 1, pageSize: 9,
    });
    const res = await request.get("/api/notices/unified-search?mode=prefs");
    expect(res.status).toBe(200);
    expect(res.body.notices).toHaveLength(0);
  });

  it("mode=recommended → 200", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [], total: 0, page: 1, pageSize: 9,
    });
    const res = await request.get("/api/notices/unified-search?mode=recommended");
    expect(res.status).toBe(200);
  });

  it("无效 mode 回退为 default", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [], total: 0, page: 1, pageSize: 9,
    });
    const res = await request.get("/api/notices/unified-search?mode=invalid");
    expect(res.status).toBe(200);
    // searchUnified 被调用时 mode 参数为 "default"
    const callArgs = (searchUnified as any).mock.calls[0];
    expect(callArgs[1].mode).toBe("default");
  });

  it("传递分页参数 → 200", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [], total: 50, page: 2, pageSize: 12,
    });
    const res = await request.get("/api/notices/unified-search?page=2&page_size=12");
    expect(res.status).toBe(200);
    expect(res.body.page_size).toBe(12);
  });

  it("传递搜索关键词和国家筛选 → 200", async () => {
    const { searchUnified } = await import("../../../server/services/search-orchestrator/index");
    (searchUnified as any).mockResolvedValue({
      notices: [], total: 0, page: 1, pageSize: 9,
    });
    const res = await request.get("/api/notices/unified-search?q=water&country=US&notice_type=tender");
    expect(res.status).toBe(200);
    const callArgs = (searchUnified as any).mock.calls[0];
    expect(callArgs[1].q).toBe("water");
    expect(callArgs[1].country).toBe("US");
    expect(callArgs[1].noticeType).toBe("tender");
  });
});

// ── countries ──
describe("集成测试 — GET /api/notices/countries", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext();
    const app = createTestApp(createNoticeSearchRouter, ctx);
    request = supertest.agent(app);
  });

  afterEach(() => vi.clearAllMocks());

  it("→ 200 + 国家列表 + Cache-Control", async () => {
    const { getNoticeCountries } = await import("../../../server/services/notice-search/index");
    (getNoticeCountries as any).mockResolvedValue([
      { country: "US", count: 100 },
      { country: "GB", count: 50 },
    ]);
    const res = await request.get("/api/notices/countries");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.headers["cache-control"]).toContain("max-age=600");
    expect(res.headers["etag"]).toBeTruthy();
  });

  it("ETag 匹配 → 304 Not Modified", async () => {
    const { getNoticeCountries } = await import("../../../server/services/notice-search/index");
    const data = [{ country: "US", count: 100 }];
    (getNoticeCountries as any).mockResolvedValue(data);

    // 第一次请求获取 ETag
    const res1 = await request.get("/api/notices/countries");
    const etag = res1.headers["etag"];
    expect(etag).toBeTruthy();

    // 第二次请求带 If-None-Match
    const res2 = await request
      .get("/api/notices/countries")
      .set("If-None-Match", etag);
    expect(res2.status).toBe(304);
  });
});

// ── agencies ──
describe("集成测试 — GET /api/notices/agencies", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext();
    const app = createTestApp(createNoticeSearchRouter, ctx);
    request = supertest.agent(app);
  });

  afterEach(() => vi.clearAllMocks());

  it("→ 200 + 机构列表", async () => {
    const { getNoticeAgencies } = await import("../../../server/services/notice-search/index");
    (getNoticeAgencies as any).mockResolvedValue([
      { agency: "USAID", count: 30 },
    ]);
    const res = await request.get("/api/notices/agencies");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.headers["cache-control"]).toContain("max-age=600");
  });

  it("locale 参数 → 传递给 getNoticeAgencies", async () => {
    const { getNoticeAgencies } = await import("../../../server/services/notice-search/index");
    (getNoticeAgencies as any).mockResolvedValue([]);
    const res = await request.get("/api/notices/agencies?locale=zh");
    expect(res.status).toBe(200);
    const callArgs = (getNoticeAgencies as any).mock.calls[0];
    expect(callArgs[1]).toBe("zh");
  });
});

// ── stats ──
describe("集成测试 — GET /api/notices/stats", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const ctx = createMockContext();
    const app = createTestApp(createNoticeSearchRouter, ctx);
    request = supertest.agent(app);
  });

  afterEach(() => vi.clearAllMocks());

  it("→ 200 + 统计数据 + ETag", async () => {
    const { getNoticeStats } = await import("../../../server/services/notice-search/index");
    (getNoticeStats as any).mockResolvedValue({
      total: 1000, today: 5, this_week: 30,
    });
    const res = await request.get("/api/notices/stats");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1000);
    expect(res.headers["etag"]).toBeTruthy();
  });
});
