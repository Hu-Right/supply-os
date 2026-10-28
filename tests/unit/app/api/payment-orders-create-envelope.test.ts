/**
 * POST /api/payment/orders 建单响应的键集合钉（命名红线② B 组最后一条·登记清零）。
 *
 * 这条出口原来是 `json({ ...result, payUrl, qrCodeUrl, paymentMode })`，而 result 来自
 * **三条不同的 createOrder**（会员单 / 学习资料·打包 / 增值服务）：任何一条在服务里加字段
 * 都会直接变成对外键，而 `let result;` 连类型都没锚住，tsc 也看不见。
 * 现在路由显式标 `let result: OrderInfo` 并按契约逐键列举（11 键）——列举的副作用是
 * 三个服务出口都被 OrderInfo 当场校验（少给必填键就编译失败）。
 * 全程假支付服务 + 假二维码生成，不打网关、不连库、不写数据。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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
const paymentMode = vi.hoisted(() => ({ mode: "mock" as "mock" | "live" }));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    payment: {
      paymentMode: paymentMode.mode,
      paymentService: { hasStrategy: mocks.hasStrategy, createOrder: mocks.createMembershipOrder },
      learningPaymentService: { createOrder: mocks.createLearningOrder },
      servicePaymentService: { createOrder: mocks.createServiceOrder },
    },
  }),
}));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKeyOrThrow }));
vi.mock("@/lib/payment/qr", () => ({ toQrDataUrl: mocks.toQrDataUrl }));

import { POST } from "@/app/api/payment/orders/route";
import { EC_PAYMENT_QR_CODE_MISSING, EC_PAYMENT_PROVIDER_UNAVAILABLE } from "@/shared/constants/api";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
// 本文件的键集合断言全走默认 `Array#sort()`（按 UTF-16 码点），所以两边都严格按码点写：
// payUrl < paymentMode（大写 U < 小写 m）、provider < qrCodeUrl（p < q）。
const CONTRACT_KEYS_MIN = [
  "amount", "createdAt", "currency", "orderNo", "payUrl", "paymentMode", "provider", "qrCodeUrl", "status",
];

function post(body: unknown) {
  return new NextRequest("http://localhost:3000/api/payment/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 一条服务返回值里塞满内部字段的样本：这些都不该出现在 wire 上 */
const membershipResult = {
  orderNo: "PM20261028A0001",
  provider: "mock",
  status: "pending",
  payUrl: "https://gateway.example/pay",
  qrCodeUrl: "https://gateway.example/qr.png",
  noticeId: 5001,
  planCode: "vip_year",
  amount: 1999,
  currency: "CNY",
  createdAt: "2026-10-28T01:00:00.000Z",
  // 服务内部字段（渠道原文、库内主键、风控标记）——整块透出时代它们都会上网
  gatewayRaw: { trade_no: "x" },
  dbId: 88,
  risk_flag: "none",
};

beforeEach(() => {
  vi.clearAllMocks();
  paymentMode.mode = "mock";
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 123, authViaJwt: true });
  mocks.hasStrategy.mockReturnValue(true);
  mocks.toQrDataUrl.mockResolvedValue("data:image/png;base64,generated");
});

describe("POST /api/payment/orders 建单信封", () => {
  it("会员单：只按 OrderInfo 出键，服务内部字段与 snake 键都上不了网", async () => {
    mocks.createMembershipOrder.mockResolvedValue(membershipResult);

    const res = await POST(post({ plan_code: "vip_year", provider: "mock", notice_id: 5001 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect([...Object.keys(body)].sort()).toEqual([
      "amount", "createdAt", "currency", "noticeId", "orderNo",
      "payUrl", "paymentMode", "planCode", "provider", "qrCodeUrl", "status",
    ]);
    expect(Object.keys(body).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    // mock 通道保留服务给的 payUrl；paymentMode 由路由改写（服务不给也不缺键）
    expect(body.payUrl).toBe("https://gateway.example/pay");
    expect(body.qrCodeUrl).toBe("data:image/png;base64,generated");
    expect(body.paymentMode).toBe("mock");
  });

  it("学习资料单：服务只给 8 键时，未提供的可选契约键直接不出现（不造 null 占位）", async () => {
    mocks.createLearningOrder.mockResolvedValue({
      orderNo: "LE20261028A0002",
      provider: "mock",
      amount: 99,
      currency: "CNY",
      payUrl: "https://gateway.example/pay",
      qrCodeUrl: undefined,
      status: "pending",
      createdAt: "2026-10-28T01:00:00.000Z",
    });

    const body = await (await POST(post({ plan_code: "material_001", provider: "mock" }))).json();

    expect([...Object.keys(body)].sort()).toEqual(CONTRACT_KEYS_MIN);
    expect("noticeId" in body).toBe(false);
    expect("planCode" in body).toBe(false);
    // qrCodeUrl 服务没给 → 路由算出 null 仍占位（前端据此判有无二维码）
    expect(body.qrCodeUrl).toBeNull();
    expect(mocks.createLearningOrder).toHaveBeenCalledTimes(1);
  });

  it("增值服务单走 servicePaymentService，出同一契约形状", async () => {
    mocks.createServiceOrder.mockResolvedValue({
      orderNo: "SV20261028A0003", provider: "mock", amount: 3000, currency: "CNY",
      payUrl: "https://gateway.example/pay", qrCodeUrl: "https://gateway.example/qr",
      status: "pending", createdAt: "2026-10-28T01:00:00.000Z",
    });

    const body = await (await POST(post({ plan_code: "svc_report", provider: "mock" }))).json();

    expect(body.orderNo).toBe("SV20261028A0003");
    expect([...Object.keys(body)].sort()).toEqual(CONTRACT_KEYS_MIN);
  });

  it("支付宝通道：payUrl 换成本站 redirect（网关原值不上网），且缺二维码 → 500 专属码", async () => {
    paymentMode.mode = "live";
    mocks.createMembershipOrder.mockResolvedValue({ ...membershipResult, provider: "alipay" });

    const okBody = await (await POST(post({ plan_code: "vip_year", provider: "alipay" }))).json();
    expect(okBody.payUrl).toBe(`/api/payment/alipay/redirect/${encodeURIComponent(membershipResult.orderNo)}`);

    mocks.createMembershipOrder.mockResolvedValue({ ...membershipResult, provider: "alipay", qrCodeUrl: undefined });
    const res = await POST(post({ plan_code: "vip_year", provider: "alipay" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: EC_PAYMENT_QR_CODE_MISSING });
  });

  it("live 模式选未开通渠道 → 400 渠道码，不建单", async () => {
    paymentMode.mode = "live";

    const res = await POST(post({ plan_code: "vip_year", provider: "stripe" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: EC_PAYMENT_PROVIDER_UNAVAILABLE });
    expect(mocks.createMembershipOrder).not.toHaveBeenCalled();
  });
});
