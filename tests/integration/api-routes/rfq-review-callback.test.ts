/**
 * POST /api/rfq/review-callback 集成测试（mock pool + mock 服务）
 * @module tests/integration/api-routes/rfq-review-callback
 *
 * 覆盖安全关键路径：签名校验、时间戳容差、幂等键、结论→HTTP 码映射。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const applyReviewDecision = vi.fn();

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ query: vi.fn().mockResolvedValue([[], []]) }),
}));
vi.mock("@/lib/services/rfq/review", () => ({
  applyReviewDecision: (...args: unknown[]) => applyReviewDecision(...args),
}));

import { signCallbackPayload } from "@/lib/services/rfq/callback-auth";

const SECRET = "integration-secret";
const URL = "http://localhost:3000/api/rfq/review-callback";

function makeRequest(body: unknown, opts: { ts?: number; signature?: string; requestId?: string } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const signature = opts.signature ?? signCallbackPayload(SECRET, ts, raw);
  return new NextRequest(URL, {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-review-timestamp": String(ts),
      "x-review-signature": signature,
      "x-review-request-id": opts.requestId ?? "req-1",
    },
  });
}

const validBody = { demandId: 7, version: 2, decision: "approved", reviewerRef: "RV-1" };

describe("POST /api/rfq/review-callback", () => {
  beforeEach(() => {
    process.env.RFQ_REVIEW_CALLBACK_SECRET = SECRET;
    applyReviewDecision.mockReset();
  });
  afterEach(() => {
    delete process.env.RFQ_REVIEW_CALLBACK_SECRET;
  });

  async function call(req: NextRequest) {
    const { POST } = await import("@/app/api/rfq/review-callback/route");
    return POST(req);
  }

  it("签名错误 → 401 且不调用服务层", async () => {
    const res = await call(makeRequest(validBody, { signature: "deadbeef" }));
    expect(res.status).toBe(401);
    expect(applyReviewDecision).not.toHaveBeenCalled();
  });

  it("时间戳超出容差 → 401（防重放）", async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await call(makeRequest(validBody, { ts: stale }));
    expect(res.status).toBe(401);
  });

  it("未配置密钥 → 503（不静默放行）", async () => {
    delete process.env.RFQ_REVIEW_CALLBACK_SECRET;
    const res = await call(makeRequest(validBody));
    expect(res.status).toBe(503);
    expect(applyReviewDecision).not.toHaveBeenCalled();
  });

  it("缺少幂等键 → 400", async () => {
    const res = await call(makeRequest(validBody, { requestId: "" }));
    expect(res.status).toBe(400);
  });

  it("通过 → 200，返回 status/version", async () => {
    applyReviewDecision.mockResolvedValue({ ok: true, status: "published", version: 2 });
    const res = await call(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "published", version: 2 });
    expect(applyReviewDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ demandId: 7, version: 2, callbackId: "req-1" }),
    );
  });

  it("版本冲突 → 409（不覆盖用户改稿）", async () => {
    applyReviewDecision.mockResolvedValue({ ok: false, reason: "version_conflict" });
    const res = await call(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it("退回缺理由 → 400", async () => {
    applyReviewDecision.mockResolvedValue({ ok: false, reason: "reason_required" });
    const res = await call(makeRequest({ ...validBody, decision: "rejected" }));
    expect(res.status).toBe(400);
  });

  it("decision 非法 → 400 且不调用服务层", async () => {
    const res = await call(makeRequest({ ...validBody, decision: "maybe" }));
    expect(res.status).toBe(400);
    expect(applyReviewDecision).not.toHaveBeenCalled();
  });
});
