/** POST /api/payment/orders 的 svc_ 分支：路由到 ServicePaymentService（不动会员核心）。 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { createOrder } = vi.hoisted(() => ({ createOrder: vi.fn() }));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    payment: {
      paymentMode: "mock",
      paymentService: { hasStrategy: vi.fn().mockReturnValue(true), createOrder: vi.fn() },
      learningPaymentService: { createOrder: vi.fn() },
      servicePaymentService: { createOrder },
      orchestrator: { getStrategy: vi.fn(), hasStrategy: vi.fn().mockReturnValue(true) },
    },
  }),
}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 123, authViaJwt: true }),
}));

vi.mock("@/lib/payment/qr", () => ({
  toQrDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
}));

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/payment/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/payment/orders — svc_ 分支", () => {
  it("有价服务码 → 走 ServicePaymentService，201 透传 order_no", async () => {
    createOrder.mockResolvedValue({
      order_no: "SV20260923ABC", provider: "mock", amount: 199, currency: "CNY",
      pay_url: "/pay/mock", qr_code_url: "https://qr", status: "pending", created_at: new Date().toISOString(),
    });
    const { POST } = await import("@/app/api/payment/orders/route");
    const res = await POST(post({ plan_code: "svc_ai_tender_analysis", provider: "mock" }));
    expect(createOrder).toHaveBeenCalled();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order_no).toBe("SV20260923ABC");
  });

  it("服务不可用（抛 SERVICE_UNAVAILABLE）→ 400", async () => {
    createOrder.mockRejectedValue(new Error("SERVICE_UNAVAILABLE"));
    const { POST } = await import("@/app/api/payment/orders/route");
    const res = await POST(post({ plan_code: "svc_ai_bid_writing", provider: "mock" }));
    expect(res.status).toBe(400);
  });
});
