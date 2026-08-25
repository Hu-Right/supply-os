/**
 * API 集成测试 — 公告域：报告预览 / 报告下载
 * Integration tests for notices/report routes via supertest
 *
 * 覆盖端点：
 *   GET /api/notices/:id/report/preview — 报告结构化预览
 *   GET /api/notices/:id/report         — 报告 docx 下载
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
vi.mock("../../../server/services/notices", () => ({
  findQualifiedOpportunityForNotice: vi.fn(),
}));

vi.mock("../../../server/services/bid-report/index", () => ({
  buildBidReportDocx: vi.fn(),
  buildBidReportPreviewText: vi.fn(),
  estimateFullReportCharCount: vi.fn(),
  mergeBidReportRow: vi.fn(),
  bidReportFileName: vi.fn(),
}));

vi.mock("../../../server/utils/normalize", () => ({
  normalizeUserKey: vi.fn((key: string) => key),
}));

// Mock fs.promises 以避免真实文件系统操作
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    promises: {
      readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { createNoticeReportRouter } from "../../../server/routes/notices/report.routes";

// ── GET /api/notices/:id/report/preview ──
describe("集成测试 — GET /api/notices/:id/report/preview", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeUnlockRepo: { findUnlock: vi.fn() },
      noticeDetailRepo: { findDetail: vi.fn() },
      opportunitiesRepo: { findFullById: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report/preview");
    expect(res.status).toBe(401);
  });

  it("公告不存在 → 404", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue(null);
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/999/report/preview").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it("无合格机会 → 404 报告不可用", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1, title: "Test" });
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices");
    (findQualifiedOpportunityForNotice as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report/preview").set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(40024);
  });

  it("已解锁用户 → 200 完整预览", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices");
    const { buildBidReportPreviewText, estimateFullReportCharCount, mergeBidReportRow } =
      await import("../../../server/services/bid-report/index");

    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1, title: "Test" });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue({ id: 10, title: "Opp" });
    (ctx.opportunitiesRepo.findFullById as any).mockResolvedValue({ id: 10, title: "Full Opp" });
    (mergeBidReportRow as any).mockReturnValue({ notice_id: 1, opportunity_id: 10 });
    (buildBidReportPreviewText as any).mockReturnValue([
      { heading: "概述", body: "这是报告概述内容" },
      { heading: "分析", body: "这是分析内容" },
    ]);
    (estimateFullReportCharCount as any).mockReturnValue(5000);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report/preview").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.is_unlocked).toBe(true);
    expect(res.body.has_full_report).toBe(true);
    expect(res.body.total_report_chars).toBe(5000);
    expect(res.body.sections).toHaveLength(2);
    // 已解锁：内容不截断
    expect(res.body.sections[0].body).toBe("这是报告概述内容");
  });

  it("未解锁用户 → 200 截断预览", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices");
    const { buildBidReportPreviewText, estimateFullReportCharCount, mergeBidReportRow } =
      await import("../../../server/services/bid-report/index");

    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue(null);
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1, title: "Test" });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue({ id: 10 });
    (ctx.opportunitiesRepo.findFullById as any).mockResolvedValue(null);
    (mergeBidReportRow as any).mockReturnValue({ notice_id: 1 });
    (buildBidReportPreviewText as any).mockReturnValue([
      { heading: "概述", body: "A".repeat(600) },
    ]);
    (estimateFullReportCharCount as any).mockReturnValue(5000);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report/preview").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.is_unlocked).toBe(false);
    // 未解锁：每段截断至 500 字 + "…"
    expect(res.body.sections[0].body).toHaveLength(501); // 500 + "…"
    expect(res.body.sections[0].body).toMatch(/…$/);
  });
});

// ── GET /api/notices/:id/report ──
describe("集成测试 — GET /api/notices/:id/report", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeUnlockRepo: { findUnlock: vi.fn() },
      noticeDetailRepo: { findDetail: vi.fn() },
      opportunitiesRepo: { findFullById: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report");
    expect(res.status).toBe(401);
  });

  it("未解锁 → 403", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report").set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(40023);
  });

  it("公告不存在 → 404", async () => {
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/999/report").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it("无合格机会 → 404 报告不可用", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices");
    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1 });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue(null);

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report").set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(40024);
  });

  it("解锁 + 有效机会 → 200 docx 下载", async () => {
    const { findQualifiedOpportunityForNotice } = await import("../../../server/services/notices");
    const { mergeBidReportRow, bidReportFileName, buildBidReportDocx } =
      await import("../../../server/services/bid-report/index");

    (ctx.notice.unlockRepo.findUnlock as any).mockResolvedValue({ notice_id: 1 });
    (ctx.notice.detailRepo.findDetail as any).mockResolvedValue({ id: 1 });
    (findQualifiedOpportunityForNotice as any).mockResolvedValue({
      id: 10, update_time: "2026-01-01",
    });
    (ctx.opportunitiesRepo.findFullById as any).mockResolvedValue({
      id: 10, update_time: "2026-01-01",
    });
    (mergeBidReportRow as any).mockReturnValue({ notice_id: 1, opportunity_id: 10 });
    (bidReportFileName as any).mockReturnValue("bid_report_1.docx");
    (buildBidReportDocx as any).mockResolvedValue(Buffer.from("fake-docx-content"));

    const app = createTestApp(createNoticeReportRouter, ctx);
    const res = await supertest(app).get("/api/notices/1/report").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("wordprocessingml");
    expect(res.headers["content-disposition"]).toContain("bid_report_1.docx");
  });
});
