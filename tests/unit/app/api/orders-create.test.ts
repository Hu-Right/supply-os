/**
 * POST /api/orders — 统一下单入口的契约钉
 *
 * 这个入口的全部价值就是「别再让服务端从字符串前缀猜买的是什么」，所以测三件事：
 * 1) `product_kind` + `product_code` 能翻译成各服务认得的真实商品码（含 material/bundle 补前缀）；
 * 2) kind 与 code 对不上时**当场 400**，不许滑到服务层再报「套餐不存在」那种误导性错误；
 * 3) 与旧入口共用同一份执行器与响应信封（这里只抽一条形状断言，全量键集合在
 *    payment-orders-create-envelope.test.ts 里已钉住）。
 *
 * 全程假支付服务 + 假二维码生成，不打网关、不连库、不写数据。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createMembershipOrder: vi.fn(),
  createLearningOrder: vi.fn(),
  createServiceOrder: vi.fn(),
  hasStrategy: vi.fn(),
  toQrDataUrl: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    payment: {
      paymentMode: "mock",
      paymentService: { hasStrategy: mocks.hasStrategy, createOrder: mocks.createMembershipOrder },
      learningPaymentService: { createOrder: mocks.createLearningOrder },
      servicePaymentService: { createOrder: mocks.createServiceOrder },
    },
  }),
}));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKeyOrThrow }));
vi.mock("@/lib/payment/qr", () => ({ toQrDataUrl: mocks.toQrDataUrl }));

import { POST } from "@/app/api/orders/route";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

const okResult = (over: Record<string, unknown> = {}) => ({
  orderNo: "PM20261112A0001",
  provider: "mock",
  status: "pending",
  payUrl: "https://gateway.example/pay",
  qrCodeUrl: "https://gateway.example/qr.png",
  amount: 8800,
  currency: "CNY",
  createdAt: "2026-11-12T05:00:00.000Z",
  ...over,
});

function post(body: unknown) {
  return new NextRequest("http://localhost:3000/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 123, authViaJwt: true });
  mocks.hasStrategy.mockReturnValue(true);
  mocks.toQrDataUrl.mockResolvedValue("data:image/png;base64,generated");
  mocks.createMembershipOrder.mockResolvedValue(okResult());
  mocks.createLearningOrder.mockResolvedValue(okResult({ orderNo: "LE20261112A0002" }));
  mocks.createServiceOrder.mockResolvedValue(okResult({ orderNo: "SV20261112A0003" }));
});

describe("POST /api/orders 商品码翻译", () => {
  it("kind=plan：码原样下发，附带 industry_code / order_type 透传", async () => {
    const res = await POST(post({
      product_kind: "plan", product_code: "business", provider: "mock",
      industry_code: "UGT-85", order_type: "upgrade", original_plan_code: "basic", notice_id: 5001,
    }));
    expect(res.status).toBe(201);
    expect(mocks.createMembershipOrder).toHaveBeenCalledTimes(1);
    const arg = mocks.createMembershipOrder.mock.calls[0][0];
    expect(arg).toMatchObject({
      plan_code: "business", industry_code: "UGT-85",
      order_type: "upgrade", original_plan_code: "basic", notice_id: 5001,
    });
  });

  it("kind=material：裸目录主键自动补命名空间前缀", async () => {
    await POST(post({ product_kind: "material", product_code: "training-doc-04", provider: "mock" }));
    expect(mocks.createLearningOrder.mock.calls[0][0]).toMatchObject({ planCode: "material_training-doc-04" });
  });

  it("kind=material：已带前缀时不重复补（幂等）", async () => {
    await POST(post({ product_kind: "material", product_code: "material_training-doc-04", provider: "mock" }));
    expect(mocks.createLearningOrder.mock.calls[0][0]).toMatchObject({ planCode: "material_training-doc-04" });
  });

  it("kind=bundle：补 bundle_ 前缀", async () => {
    await POST(post({ product_kind: "bundle", product_code: "bundle-all", provider: "mock" }));
    expect(mocks.createLearningOrder.mock.calls[0][0]).toMatchObject({ planCode: "bundle_bundle-all" });
  });

  it("kind=service：svc_ 属于 SKU 码本身，原样下发不剥不补", async () => {
    await POST(post({ product_kind: "service", product_code: "svc_ai_tender_analysis", provider: "mock" }));
    expect(mocks.createServiceOrder.mock.calls[0][0]).toMatchObject({ serviceCode: "svc_ai_tender_analysis" });
  });

  it("响应信封与旧入口一致（11 键同形）", async () => {
    const body = await (await POST(post({ product_kind: "plan", product_code: "business", provider: "mock" }))).json();
    expect([...Object.keys(body)].sort()).toEqual([
      "amount", "createdAt", "currency", "orderNo", "payUrl",
      "paymentMode", "provider", "qrCodeUrl", "status",
    ]);
    expect(body.paymentMode).toBe("mock");
  });
});

describe("POST /api/orders 契约校验", () => {
  it("kind 与 code 错配 → 400，不触达任何服务", async () => {
    const res = await POST(post({ product_kind: "plan", product_code: "svc_ai_tender_analysis", provider: "mock" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: EC_INVALID_PARAMS });
    expect(mocks.createServiceOrder).not.toHaveBeenCalled();
    expect(mocks.createMembershipOrder).not.toHaveBeenCalled();
  });

  it("kind=course → 400 并指路培训路由（培训无商品码）", async () => {
    const res = await POST(post({ product_kind: "course", product_code: "7", provider: "mock" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(EC_INVALID_PARAMS);
    expect(body.message).toContain("/api/training/orders");
  });

  it("缺 product_code → 400", async () => {
    const res = await POST(post({ product_kind: "plan", provider: "mock" }));
    expect(res.status).toBe(400);
  });

  it("非法 JSON → 400（不是 500）", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: EC_INVALID_PARAMS });
  });
});
