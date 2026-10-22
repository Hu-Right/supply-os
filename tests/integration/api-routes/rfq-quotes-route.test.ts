/**
 * DELETE /api/rfq/[id]/quotes 路由集成测试 — 供应商撤回自己的报价
 *
 * @description 服务层 withdrawQuote 命中/未命中 → 200/404；参数校验 → 400。
 *   服务层内部逻辑由 rfq-quotes 单测覆盖，此处 mock。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolQuery, requireUserKeyOrThrow, withdrawQuote, unawardQuote } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
  withdrawQuote: vi.fn(),
  unawardQuote: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/services/rfq-quotes", () => ({
  getQuoteableRfq: vi.fn(),
  checkQuoteEligibility: vi.fn(),
  submitQuote: vi.fn(),
  listQuotesForBuyer: vi.fn(),
  withdrawQuote,
  unawardQuote,
}));

function del(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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
  requireUserKeyOrThrow.mockResolvedValue({ userId: 42, authViaJwt: true });
});

async function call(rfqId: string, body: unknown) {
  const { DELETE } = await import("@/app/api/rfq/[id]/quotes/route");
  return DELETE(del(`/api/rfq/${rfqId}/quotes`, body), { params: Promise.resolve({ id: rfqId }) });
}

describe("DELETE /api/rfq/[id]/quotes", () => {
  it("命中 submitted → 200 withdrawn:true", async () => {
    withdrawQuote.mockResolvedValueOnce(true);
    const res = await call("5", { quoteId: 77 });
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ withdrawn: true });
    expect(withdrawQuote.mock.calls[0].slice(1)).toEqual([77, 42]);
  });

  it("未命中（已选定/非本人）→ 404", async () => {
    withdrawQuote.mockResolvedValueOnce(false);
    expect((await call("5", { quoteId: 77 })).status).toBe(404);
  });

  it("缺少 quoteId → 400；非法 rfqId → 400", async () => {
    expect((await call("5", {})).status).toBe(400);
    expect((await call("x", { quoteId: 77 })).status).toBe(400);
    expect(withdrawQuote).not.toHaveBeenCalled();
  });
});

describe("POST /api/rfq/[id]/unaward", () => {
  async function callUnaward(rfqId: string) {
    const { POST } = await import("@/app/api/rfq/[id]/unaward/route");
    return POST(post(`/api/rfq/${rfqId}/unaward`, {}), { params: Promise.resolve({ id: rfqId }) });
  }

  it("成功 → 200 revoked", async () => {
    unawardQuote.mockResolvedValueOnce({ ok: true, winnerSupplierUserId: 42 });
    const res = await callUnaward("5");
    expect(res.status).toBe(200);
    expect((await res.json()).revoked).toBe(true);
  });

  it("forbidden → 403；closed → 409；no_winner → 409", async () => {
    unawardQuote.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    expect((await callUnaward("5")).status).toBe(403);
    unawardQuote.mockResolvedValueOnce({ ok: false, reason: "closed" });
    expect((await callUnaward("5")).status).toBe(409);
    unawardQuote.mockResolvedValueOnce({ ok: false, reason: "no_winner" });
    expect((await callUnaward("5")).status).toBe(409);
  });

  it("非法 rfqId → 400", async () => {
    expect((await callUnaward("0")).status).toBe(400);
  });
});
