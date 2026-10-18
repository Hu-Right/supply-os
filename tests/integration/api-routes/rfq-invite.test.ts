/**
 * POST /api/rfq/[id]/invite 路由集成测试
 *
 * @description 覆盖买方发起邀约的路由规则：仅创建者、仅 published；preview→dryRun 且返回脱敏名单
 *   （不含邮箱）；send→public 仅触达、targeted 额外写 invites。服务层匹配/发信逻辑由单测覆盖，此处 mock。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolQuery, requireUserKeyOrThrow, outreachPublishedRfq, addInvites } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
  outreachPublishedRfq: vi.fn(),
  addInvites: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/services/rfq-outreach", () => ({
  DEFAULT_MATCH_LIMIT: 20,
  outreachPublishedRfq,
  addInvites,
}));

const OWNER_ID = 6;

function rfqRow(over: Record<string, unknown> = {}) {
  return [[{ user_id: OWNER_ID, rfq_status: "published", visibility: "public", ...over }]];
}
function post(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserKeyOrThrow.mockResolvedValue({ userId: OWNER_ID, authViaJwt: true });
});

async function call(body: unknown) {
  const { POST } = await import("@/app/api/rfq/[id]/invite/route");
  return POST(post("/api/rfq/501/invite", body), { params: Promise.resolve({ id: "501" }) });
}

describe("POST /api/rfq/[id]/invite", () => {
  it("preview → dryRun 取范围，返回脱敏候选（不含邮箱），不写 invites", async () => {
    poolQuery.mockResolvedValueOnce(rfqRow());
    outreachPublishedRfq.mockResolvedValueOnce({
      published: true, recipients: 2, emailed: 0, skipped: 0, dryRun: true, strategy: "region",
      preview: [
        { userId: 41, email: "a@x.com", company: "A公司", matchCount: 0 },
        { userId: 42, email: "b@x.com", company: "B公司", matchCount: 1 },
      ],
    });
    const res = await call({ action: "preview" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ strategy: "region", total: 2 });
    expect(json.data.candidates).toEqual([
      { company: "A公司", matchCount: 0 },
      { company: "B公司", matchCount: 1 },
    ]);
    expect(JSON.stringify(json.data.candidates)).not.toContain("@x.com");
    expect(outreachPublishedRfq.mock.calls[0][1].dryRun).toBe(true);
    expect(addInvites).not.toHaveBeenCalled();
  });

  it("send + public → 仅触达，不写 invites", async () => {
    poolQuery.mockResolvedValueOnce(rfqRow({ visibility: "public" }));
    outreachPublishedRfq.mockResolvedValueOnce({
      published: true, recipients: 2, emailed: 2, skipped: 0, dryRun: false, strategy: "category",
      preview: [{ userId: 41, email: "a@x.com", company: "A", matchCount: 1 }],
    });
    const res = await call({ action: "send" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ emailed: 2, invited: 0, strategy: "category" });
    expect(outreachPublishedRfq.mock.calls[0][1].dryRun).toBe(false);
    expect(addInvites).not.toHaveBeenCalled();
  });

  it("send + targeted → 命中供应商写入 crm_rfq_invites", async () => {
    poolQuery.mockResolvedValueOnce(rfqRow({ visibility: "targeted" }));
    outreachPublishedRfq.mockResolvedValueOnce({
      published: true, recipients: 2, emailed: 2, skipped: 0, dryRun: false, strategy: "region",
      preview: [
        { userId: 41, email: "a@x.com", company: "A", matchCount: 0 },
        { userId: 42, email: "b@x.com", company: "B", matchCount: 0 },
      ],
    });
    addInvites.mockResolvedValueOnce(2);
    const res = await call({ action: "send" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ emailed: 2, invited: 2 });
    expect(addInvites.mock.calls[0][1]).toEqual(501);
    expect(addInvites.mock.calls[0][2]).toEqual(OWNER_ID);
    expect(addInvites.mock.calls[0][3]).toEqual([41, 42]);
  });

  it("未发布 → 409；非创建者 → 403；不存在 → 404", async () => {
    poolQuery.mockResolvedValueOnce(rfqRow({ rfq_status: "pending_review" }));
    expect((await call({ action: "preview" })).status).toBe(409);

    poolQuery.mockResolvedValueOnce(rfqRow({ user_id: 999 }));
    expect((await call({ action: "preview" })).status).toBe(403);

    poolQuery.mockResolvedValueOnce([[]]);
    expect((await call({ action: "preview" })).status).toBe(404);
  });

  it("非法 id → 400", async () => {
    const { POST } = await import("@/app/api/rfq/[id]/invite/route");
    const res = await POST(post("/api/rfq/x/invite", { action: "preview" }), { params: Promise.resolve({ id: "0" }) });
    expect(res.status).toBe(400);
  });
});
