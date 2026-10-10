/**
 * RFQ 路由集成测试（create / submit / withdraw）
 *
 * @description 覆盖 RFQ 需求发布全生命周期的服务端规则：
 *              - create：字段校验边界（标题/描述/截止时间/联系人/邮箱）、
 *                写入 crm_bid_notices（notice_type='RFQ', entry_source='platform'）、
 *                reference/notice_id 回填 OSRFQ-{id 12位补零}
 *              - submit：draft→published（写 published_date）、幂等重复发布、
 *                closed 拒绝、非创建者 403、不存在 404
 *              - withdraw：published/pending_review→closed、draft 拒绝、越权 403
 *              Mock DB Pool 与鉴权，验证路由逻辑与 SQL 语义。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolQuery, requireUserKeyOrThrow } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ query: poolQuery }),
}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow,
}));

vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
}));

const OWNER_ID = 6;
const NOW = new Date();
const inSevenDays = (d: Date = NOW) =>
  new Date(d.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "E2E 集成测试采购需求标题（长度充足）",
    description: "这是一个用于集成测试的采购需求描述，内容长度超过五十字的下限要求，用于验证发布校验与写入链路的完整性与状态流转。",
    deadline: inSevenDays(),
    contact_name: "集成测试",
    contact_email: "it@example.com",
    ...overrides,
  };
}

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 模拟 RFQ 行（submit/withdraw 的权限与状态前置查询） */
function rfqRow(overrides: Partial<{ id: number; rfq_status: string; user_id: number }> = {}) {
  return [{ id: 501, rfq_status: "draft", user_id: OWNER_ID, ...overrides }];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserKeyOrThrow.mockResolvedValue({ userId: OWNER_ID, authViaJwt: true });
  // INSERT/UPDATE 默认成功；SELECT 由用例覆写
  poolQuery.mockResolvedValue([{ insertId: 501, affectedRows: 1 }]);
});

describe("POST /api/rfq/create — 参数校验边界", () => {
  it("标题过短 → 400 明确提示", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ title: "短" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("标题");
  });

  it("描述过短 → 400 明确提示", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ description: "太短的描述" })));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("描述");
  });

  it("截止时间已过 → 400", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ deadline: "2020-01-01" })));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("截止");
  });

  it("缺联系人 → 400", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ contact_name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("联系人");
  });

  it("邮箱格式非法 → 400", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ contact_email: "not-an-email" })));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("邮箱");
  });

  it("请求体非法 JSON → 400", async () => {
    const { POST } = await import("@/app/api/rfq/create/route");
    const req = new NextRequest("http://localhost:3000/api/rfq/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/rfq/create — 写入语义", () => {
  it("合法请求 → 201，INSERT notice_type='RFQ' + entry_source='platform'，回填 OSRFQ 编号", async () => {
    poolQuery
      .mockResolvedValueOnce([{ insertId: 501, affectedRows: 1 }]) // INSERT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE reference
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(501);

    const insertSql = String(poolQuery.mock.calls[0][0]);
    expect(insertSql).toContain("INSERT INTO crm_bid_notices");
    expect(insertSql).toContain("'RFQ'");
    expect(insertSql).toContain("'platform'");
    // deadline 写基色列 deadline_ts（STORED 生成列 deadline_sec 不可写）
    const insertParams = poolQuery.mock.calls[0][1] as unknown[];
    expect(insertSql).not.toContain("deadline_sec");
    expect(insertParams).toContain("draft");

    // 编号回填：OSRFQ-{id 12位补零}，reference 与 notice_id 同值
    const updateSql = String(poolQuery.mock.calls[1][0]);
    expect(updateSql).toContain("SET reference = ?, notice_id = ? WHERE id = ?");
    expect(poolQuery.mock.calls[1][1]).toEqual(["OSRFQ-000000000501", "OSRFQ-000000000501", 501]);
  });

  it("status=published 的初始状态被接受", async () => {
    poolQuery
      .mockResolvedValueOnce([{ insertId: 502, affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody({ status: "published" })));
    expect(res.status).toBe(201);
    expect(poolQuery.mock.calls[0][1]).toContain("published");
  });

  it("INSERT 失败 → 500 兜底文案（不泄露 SQL 细节）", async () => {
    poolQuery.mockRejectedValueOnce(new Error("ER_SOMETHING"));
    const { POST } = await import("@/app/api/rfq/create/route");
    const res = await POST(post("/api/rfq/create", validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe(50000);
    expect(body.message).not.toContain("ER_SOMETHING");
  });
});

describe("PATCH /api/rfq/[id]/submit — 状态机", () => {
  it("draft → published：写 published_date", async () => {
    poolQuery
      .mockResolvedValueOnce([rfqRow({ rfq_status: "draft" })]) // SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", { status: "published" }), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(200);
    const updateSql = String(poolQuery.mock.calls[1][0]);
    expect(updateSql).toContain("published_date = CURDATE()");
    expect(poolQuery.mock.calls[1][1]).toEqual(["published", 501, OWNER_ID]);
  });

  it("draft → pending_review：不写 published_date", async () => {
    poolQuery
      .mockResolvedValueOnce([rfqRow({ rfq_status: "draft" })])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(200);
    expect(String(poolQuery.mock.calls[1][0])).not.toContain("published_date");
  });

  it("已 published 再提交 → 幂等 200 already_published，不执行 UPDATE", async () => {
    poolQuery.mockResolvedValueOnce([rfqRow({ rfq_status: "published" })]);
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", { status: "published" }), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_published).toBe(true);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it("closed 状态 → 400 拒绝重新提交", async () => {
    poolQuery.mockResolvedValueOnce([rfqRow({ rfq_status: "closed" })]);
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", { status: "published" }), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("撤回");
  });

  it("非创建者 → 403", async () => {
    poolQuery.mockResolvedValueOnce([rfqRow({ user_id: 999 })]);
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", { status: "published" }), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(403);
  });

  it("不存在 → 404", async () => {
    poolQuery.mockResolvedValueOnce([[]]);
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/501/submit", { status: "published" }), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(404);
  });

  it("非法 ID → 400", async () => {
    const { PATCH } = await import("@/app/api/rfq/[id]/submit/route");
    const res = await PATCH(patch("/api/rfq/abc/submit", { status: "published" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/rfq/[id]/withdraw — 撤回", () => {
  it("published → closed", async () => {
    poolQuery
      .mockResolvedValueOnce([rfqRow({ rfq_status: "published" })])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { PATCH } = await import("@/app/api/rfq/[id]/withdraw/route");
    const res = await PATCH(patch("/api/rfq/501/withdraw", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls[1][1]).toEqual(["closed", 501, OWNER_ID]);
  });

  it("pending_review → closed（待审核也可撤回）", async () => {
    poolQuery
      .mockResolvedValueOnce([rfqRow({ rfq_status: "pending_review" })])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { PATCH } = await import("@/app/api/rfq/[id]/withdraw/route");
    const res = await PATCH(patch("/api/rfq/501/withdraw", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(200);
  });

  it("draft 状态 → 400 拒绝撤回", async () => {
    poolQuery.mockResolvedValueOnce([rfqRow({ rfq_status: "draft" })]);
    const { PATCH } = await import("@/app/api/rfq/[id]/withdraw/route");
    const res = await PATCH(patch("/api/rfq/501/withdraw", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(res.status).toBe(400);
  });

  it("非创建者 → 403；不存在 → 404", async () => {
    const { PATCH } = await import("@/app/api/rfq/[id]/withdraw/route");
    poolQuery.mockResolvedValueOnce([rfqRow({ user_id: 999 })]);
    const forbidden = await PATCH(patch("/api/rfq/501/withdraw", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(forbidden.status).toBe(403);

    poolQuery.mockResolvedValueOnce([[]]);
    const missing = await PATCH(patch("/api/rfq/501/withdraw", {}), {
      params: Promise.resolve({ id: "501" }),
    });
    expect(missing.status).toBe(404);
  });
});
