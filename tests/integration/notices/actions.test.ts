/**
 * API 集成测试 — 公告域：解锁列表 / 反馈 / 浏览计数 / 解锁 / 意向
 * Integration tests for notices/actions routes via supertest
 *
 * 覆盖端点：
 *   GET  /api/notices/unlocks       — 解锁列表
 *   POST /api/notices/feedback      — 推荐反馈
 *   POST /api/notices/:id/view      — 浏览计数
 *   POST /api/notices/:id/unlock    — 解锁公告
 *   POST /api/notices/:id/interest  — 表达意向
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
vi.mock("../../../server/services/notice-actions", () => ({
  executeUnlock: vi.fn(),
  processFeedback: vi.fn(),
  submitInterest: vi.fn(),
  NoticeNotFoundError: class NoticeNotFoundError extends Error {},
  QuotaExceededError: class QuotaExceededError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { createNoticeActionsRouter } from "../../../server/routes/notices/actions.routes";

// ── GET /api/notices/unlocks ──
describe("集成测试 — GET /api/notices/unlocks", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeUnlockRepo: { listNoticeUnlocks: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).get("/api/notices/unlocks");
    expect(res.status).toBe(401);
  });

  it("有 JWT → 200 解锁列表", async () => {
    const unlocks = [
      { notice_id: 1, title: "Notice 1" },
      { notice_id: 2, title: "Notice 2" },
    ];
    (ctx.notice.unlockRepo.listNoticeUnlocks as any).mockResolvedValue(unlocks);

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).get("/api/notices/unlocks").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].notice_id).toBe(1);
  });
});

// ── POST /api/notices/feedback ──
describe("集成测试 — POST /api/notices/feedback", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeDetailRepo: {},
      noticeFeedbackRepo: {},
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/feedback").send({});
    expect(res.status).toBe(401);
  });

  it("缺少 session_id → 400", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({ actions: [{ notice_id: 1, action: "click" }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40007);
  });

  it("缺少 actions → 400", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({ session_id: "sess-123" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40008);
  });

  it("超过 50 条操作 → 400", async () => {
    const actions = Array.from({ length: 51 }, (_, i) => ({
      notice_id: i + 1, action: "click",
    }));
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({ session_id: "sess-123", actions });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40009);
  });

  it("无效操作被过滤 → 无有效操作 → 400", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({
        session_id: "sess-123",
        actions: [{ notice_id: 0, action: "invalid_action" }],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40010);
  });

  it("有效反馈 → 201", async () => {
    const { processFeedback } = await import("../../../server/services/notice-actions");
    (processFeedback as any).mockResolvedValue({ saved: 1 });

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({
        session_id: "sess-123",
        actions: [{ notice_id: 1, action: "click" }],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("单条 notice_id 格式 → 201", async () => {
    const { processFeedback } = await import("../../../server/services/notice-actions");
    (processFeedback as any).mockResolvedValue({ saved: 1 });

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/feedback")
      .set(AUTH_HEADER)
      .send({ session_id: "sess-123", notice_id: 1, action: "impression" });
    expect(res.status).toBe(201);
  });
});

// ── POST /api/notices/:id/view ──
describe("集成测试 — POST /api/notices/:id/view", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeInteractionRepo: { insertView: vi.fn() },
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/view");
    expect(res.status).toBe(401);
  });

  it("有 JWT → 200 浏览计数成功", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/view").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(ctx.notice.interactionRepo.insertView).toHaveBeenCalledOnce();
  });
});

// ── POST /api/notices/:id/unlock ──
describe("集成测试 — POST /api/notices/:id/unlock", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeDetailRepo: {},
      noticeUnlockRepo: {},
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/unlock");
    expect(res.status).toBe(401);
  });

  it("解锁成功（free） → 201", async () => {
    const { executeUnlock } = await import("../../../server/services/notice-actions");
    (executeUnlock as any).mockResolvedValue({ unlockType: "free", alreadyUnlocked: false });

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/unlock").set(AUTH_HEADER);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.unlock_type).toBe("free");
  });

  it("已解锁 → 200 alreadyUnlocked", async () => {
    const { executeUnlock } = await import("../../../server/services/notice-actions");
    (executeUnlock as any).mockResolvedValue({ alreadyUnlocked: true });

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/unlock").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.alreadyUnlocked).toBe(true);
  });

  it("公告不存在 → 404", async () => {
    const { executeUnlock, NoticeNotFoundError } = await import("../../../server/services/notice-actions");
    (executeUnlock as any).mockRejectedValue(new (NoticeNotFoundError as any)("not found"));

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/999/unlock").set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it("免费配额超限 → 402", async () => {
    const { executeUnlock, QuotaExceededError } = await import("../../../server/services/notice-actions");
    (executeUnlock as any).mockRejectedValue(new (QuotaExceededError as any)("FREE_LIMIT_REACHED", "免费次数已用完"));

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/unlock").set(AUTH_HEADER);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe(41101);
  });
});

// ── POST /api/notices/:id/interest ──
describe("集成测试 — POST /api/notices/:id/interest", () => {
  let ctx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext({
      noticeDetailRepo: {},
      noticeInteractionRepo: {},
    });
  });

  it("无 JWT → 401", async () => {
    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app).post("/api/notices/1/interest");
    expect(res.status).toBe(401);
  });

  it("表达意向 → 201", async () => {
    const { submitInterest } = await import("../../../server/services/notice-actions");
    (submitInterest as any).mockResolvedValue(undefined);

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/1/interest")
      .set(AUTH_HEADER)
      .send({ interest_type: "subscribed", note: "Very interested" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.interest_type).toBe("subscribed");
  });

  it("默认 interest_type = interested", async () => {
    const { submitInterest } = await import("../../../server/services/notice-actions");
    (submitInterest as any).mockResolvedValue(undefined);

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/1/interest")
      .set(AUTH_HEADER)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.interest_type).toBe("interested");
  });

  it("公告不存在 → 404", async () => {
    const { submitInterest, NoticeNotFoundError } = await import("../../../server/services/notice-actions");
    (submitInterest as any).mockRejectedValue(new (NoticeNotFoundError as any)("not found"));

    const app = createTestApp(createNoticeActionsRouter, ctx);
    const res = await supertest(app)
      .post("/api/notices/999/interest")
      .set(AUTH_HEADER)
      .send({ interest_type: "interested" });
    expect(res.status).toBe(404);
  });
});
