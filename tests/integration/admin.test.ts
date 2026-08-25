/**
 * API 集成测试 — 管理运维域：数据操作 / 质量监控 / 翻译重试 / 用户管理 / 指标
 * Integration tests for admin routes via supertest
 *
 * 覆盖端点：
 *   POST /api/admin/sync-bridge              — 全量 bridge 回填
 *   POST /api/admin/backfill-amounts         — 金额回填
 *   POST /api/admin/rollup-views             — 浏览量日汇总
 *   POST /api/admin/quality-snapshot         — 采集质量快照
 *   GET  /api/admin/quality-snapshot         — 查询质量快照
 *   GET  /api/procurement/schema-status      — Schema 健康检查
 *   POST /api/admin/retry-translation        — 触发翻译重试
 *   GET  /api/admin/retry-translation        — 查询翻译重试状态
 *   POST /api/admin/users/:userKey/reset-password — 重置用户密码
 *   POST /api/admin/users/:userKey/reset-email    — 更换用户邮箱
 *   GET  /api/admin/email-logs               — 邮件发送记录
 *   GET  /api/admin/reco-ab-metrics          — A/B 推荐指标
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { createMockContext, createTestApp } from "./helpers";
import type { AppContext } from "./helpers";

// ── Mock JWT ──
vi.mock("../../server/services/jwt", () => ({
  verifyAccessToken: vi.fn().mockReturnValue({ user_key: "admin" }),
  extractBearerToken: vi.fn((auth?: string) => auth?.replace(/^Bearer\s+/i, "") || ""),
}));

// ── Mock 服务模块 ──
vi.mock("../../server/services/bridge-sync", () => ({
  syncUnspscBridgeFull: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/db/backfills", () => ({
  backfillUnspscCodeIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/services/amount/index", () => ({
  AMOUNT_PARSE_VERSION: 1,
  backfillNoticeAmountCache: vi.fn().mockResolvedValue({ processed: 0 }),
  rollupNoticeViewDaily: vi.fn().mockResolvedValue({ affected: 0 }),
}));

vi.mock("../../server/services/quality-monitor", () => ({
  captureDataQualitySnapshot: vi.fn().mockResolvedValue({ total: 100 }),
}));

vi.mock("../../server/services/translation/retry", () => ({
  runRetryTranslation: vi.fn().mockResolvedValue({ scanned: 0, ok: 0, failed: 0, skipped: 0, charsUsed: 0, durationMs: 0 }),
  countPendingRetries: vi.fn().mockResolvedValue({ pending: 5 }),
  isRetryRunning: vi.fn().mockReturnValue(false),
  getLastRetryResult: vi.fn().mockReturnValue(null),
}));

vi.mock("../../server/services/recommend/index", () => ({
  AB_TREATMENT_PCT: 50,
}));

vi.mock("../../server/services/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("$2b$12$hashed"),
}));

vi.mock("../../server/utils/passwordPolicy", () => ({
  validatePassword: vi.fn((pw: string) =>
    pw.length >= 8 ? { valid: true, message: "" } : { valid: false, message: "密码至少 8 位" }
  ),
}));

import { createAdminDataOpsRouter } from "../../server/routes/admin/data-ops.routes";
import { createAdminQualityRouter } from "../../server/routes/admin/quality.routes";
import { createAdminTranslationRouter } from "../../server/routes/admin/translation.routes";
import { createAdminUserMgmtRouter } from "../../server/routes/admin/user-mgmt.routes";
import { createAdminMetricsRouter } from "../../server/routes/admin/metrics.routes";

const ADMIN_TOKEN = "test-admin-secret";
const ADMIN_HEADER = { "x-admin-token": ADMIN_TOKEN };

/** 创建带 adminRepo mock 的 context */
function createAdminCtx(overrides?: Record<string, any>) {
  return createMockContext({
    adminRepo: {
      countAmountBackfillRemaining: vi.fn().mockResolvedValue(0),
      getViewRollupStats: vi.fn().mockResolvedValue({ rows_total: 100, latest_day: "2026-08-25" }),
      listQualitySnapshots: vi.fn().mockResolvedValue([]),
      listExistingTables: vi.fn().mockResolvedValue(new Set(["crm_users"])),
      listTableColumns: vi.fn().mockResolvedValue(new Map([["crm_users", new Set(["user_key", "email"])]])),
      countTableRows: vi.fn().mockResolvedValue(10),
      listRecoAbMetrics: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
    usersRepo: {
      findByKey: vi.fn().mockResolvedValue({ user_key: "user@test.com" }),
      updatePassword: vi.fn(),
      updateUserEmail: vi.fn(),
    },
    authRepo: {
      listPasswordResets: vi.fn().mockResolvedValue([]),
    },
  });
}

// ── 公共：无管理员密钥 → 503 ──
describe("集成测试 — Admin 端点鉴权", () => {
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_API_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
  });

  it("未配置 ADMIN_API_TOKEN → 503", async () => {
    const ctx = createAdminCtx();
    const app = createTestApp(createAdminDataOpsRouter, ctx);
    const res = await supertest(app).post("/api/admin/sync-bridge");
    expect(res.status).toBe(503);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA-OPS 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Admin Data-Ops 端点", () => {
  let ctx: AppContext;
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
    else delete process.env.ADMIN_API_TOKEN;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createAdminCtx();
  });

  it("POST /api/admin/sync-bridge 无令牌 → 401", async () => {
    const app = createTestApp(createAdminDataOpsRouter, ctx);
    const res = await supertest(app).post("/api/admin/sync-bridge");
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/sync-bridge 有令牌 → 200", async () => {
    const app = createTestApp(createAdminDataOpsRouter, ctx);
    const res = await supertest(app).post("/api/admin/sync-bridge").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/admin/backfill-amounts → 200", async () => {
    const app = createTestApp(createAdminDataOpsRouter, ctx);
    const res = await supertest(app).post("/api/admin/backfill-amounts?batches=2").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/admin/rollup-views → 200", async () => {
    const app = createTestApp(createAdminDataOpsRouter, ctx);
    const res = await supertest(app).post("/api/admin/rollup-views?since_days=7").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("affected");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUALITY 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Admin Quality 端点", () => {
  let ctx: AppContext;
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
    else delete process.env.ADMIN_API_TOKEN;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createAdminCtx();
  });

  it("POST /api/admin/quality-snapshot → 200", async () => {
    const app = createTestApp(createAdminQualityRouter, ctx);
    const res = await supertest(app).post("/api/admin/quality-snapshot").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/admin/quality-snapshot → 200", async () => {
    const app = createTestApp(createAdminQualityRouter, ctx);
    const res = await supertest(app).get("/api/admin/quality-snapshot?days=7").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/procurement/schema-status → 200", async () => {
    const app = createTestApp(createAdminQualityRouter, ctx);
    const res = await supertest(app).get("/api/procurement/schema-status").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tables).toBeInstanceOf(Array);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Admin Translation 端点", () => {
  let ctx: AppContext;
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
    else delete process.env.ADMIN_API_TOKEN;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createAdminCtx();
  });

  it("POST /api/admin/retry-translation → 200", async () => {
    const app = createTestApp(createAdminTranslationRouter, ctx);
    const res = await supertest(app).post("/api/admin/retry-translation").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("options");
  });

  it("GET /api/admin/retry-translation → 200", async () => {
    const app = createTestApp(createAdminTranslationRouter, ctx);
    const res = await supertest(app).get("/api/admin/retry-translation").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("running");
    expect(res.body).toHaveProperty("diagnosis");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER-MGMT 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Admin User-Mgmt 端点", () => {
  let ctx: AppContext;
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
    else delete process.env.ADMIN_API_TOKEN;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createAdminCtx();
  });

  it("POST /api/admin/users/:userKey/reset-password 弱密码 → 400", async () => {
    const app = createTestApp(createAdminUserMgmtRouter, ctx);
    const res = await supertest(app)
      .post("/api/admin/users/user@test.com/reset-password")
      .set(ADMIN_HEADER)
      .send({ new_password: "123" });
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/users/:userKey/reset-password 有效 → 200", async () => {
    const app = createTestApp(createAdminUserMgmtRouter, ctx);
    const res = await supertest(app)
      .post("/api/admin/users/user@test.com/reset-password")
      .set(ADMIN_HEADER)
      .send({ new_password: "NewPass123!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/admin/users/:userKey/reset-email 无效邮箱 → 400", async () => {
    const app = createTestApp(createAdminUserMgmtRouter, ctx);
    const res = await supertest(app)
      .post("/api/admin/users/user@test.com/reset-email")
      .set(ADMIN_HEADER)
      .send({ new_email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/users/:userKey/reset-email 有效 → 200", async () => {
    // findByKey: 第一次返回用户（原 key 查找），第二次返回 null（新邮箱未被占用）
    (ctx.admin.usersRepo.findByKey as any).mockResolvedValueOnce({ user_key: "user@test.com" })
      .mockResolvedValueOnce(null);
    const app = createTestApp(createAdminUserMgmtRouter, ctx);
    const res = await supertest(app)
      .post("/api/admin/users/user@test.com/reset-email")
      .set(ADMIN_HEADER)
      .send({ new_email: "newemail@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.new_email).toBe("newemail@test.com");
  });

  it("GET /api/admin/email-logs → 200", async () => {
    const app = createTestApp(createAdminUserMgmtRouter, ctx);
    const res = await supertest(app).get("/api/admin/email-logs?limit=10").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("logs");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS 域
// ═══════════════════════════════════════════════════════════════════════════════

describe("集成测试 — Admin Metrics 端点", () => {
  let ctx: AppContext;
  let origToken: string | undefined;

  beforeAll(() => {
    origToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (origToken !== undefined) process.env.ADMIN_API_TOKEN = origToken;
    else delete process.env.ADMIN_API_TOKEN;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createAdminCtx();
  });

  it("GET /api/admin/reco-ab-metrics → 200", async () => {
    const app = createTestApp(createAdminMetricsRouter, ctx);
    const res = await supertest(app).get("/api/admin/reco-ab-metrics?since_days=7").set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("since_days", 7);
    expect(res.body).toHaveProperty("treatment_pct", 50);
    expect(res.body).toHaveProperty("variants");
  });
});
