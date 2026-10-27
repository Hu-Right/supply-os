/**
 * GET /api/payment/orders(+/:orderNo) 集成测试 — 响应键命名红线（红线②）
 *
 * @description 这两个端点都是「物件整块 json 出去」（list 元素 / 查单结果直接透出），
 *              静态门禁只看得见 route.ts 里的显式字面量键，看不见这种形态。
 *              这里用**真实 PaymentOrchestrator**（仓库层用假实现）跑通路由，
 *              断言 wire 上的键全为 camelCase，且 DB 列名不外泄。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PaymentOrchestrator } from "@/lib/payment/orchestrator";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

const ORDER_ROW = {
  order_no: "SO20260903AAA", user_id: 7, provider: "alipay", plan_code: "pro",
  notice_id: 5, amount: "999.00", currency: "CNY", status: "paid",
  provider_trade_no: "T1", paid_at: new Date("2026-09-03T08:00:00Z"),
  created_at: new Date("2026-09-03T07:00:00Z"), updated_at: null,
};

const TRAINING_ROW = {
  order_no: "TR20260903BBB", user_id: 7, status: "paid",
  total_amount: "880.00", paid_at: new Date("2026-09-03T08:00:00Z"),
};

const emptyList = { findByUserId: async () => [], countByUserId: async () => 0 };

function makeOrchestrator() {
  return new PaymentOrchestrator(
    { queryOrder: async () => null } as never,
    { queryOrder: async () => null } as never,
    { findByOrderNo: async () => ORDER_ROW } as never,
    { ...emptyList } as never,
    { ...emptyList, findOrdersByUserId: async () => [], countOrdersByUserId: async () => 0,
      findOrderByNo: async () => TRAINING_ROW } as never,
    { queryOrder: async () => null } as never,
    { ...emptyList } as never,
    {
      listOrders: async () => [ORDER_ROW],
      countOrders: async () => 1,
    } as never,
    {} as never,
  );
}

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ payment: { orchestrator: makeOrchestrator() } }),
}));

const snakeKeys = (obj: unknown) =>
  Object.keys(obj as object).filter((k) => /[a-z0-9]_[a-z0-9]/.test(k));

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method: "GET" });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/payment/orders — 订单历史响应键", () => {
  it("分页元数据保留 snake（允许项），list 元素键全为 camelCase", async () => {
    const { GET } = await import("@/app/api/payment/orders/route");
    const res = await GET(req("/api/payment/orders?page=1&limit=10"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(body.list).toHaveLength(1);
    expect(snakeKeys(body.list[0])).toEqual([]);
    expect(body.list[0]).toMatchObject({
      orderNo: "SO20260903AAA",
      userId: 7,
      businessType: "membership",
      planCode: "pro",
      noticeId: 5,
      providerTradeNo: "T1",
      amount: 999,
    });
  });
});

describe("GET /api/payment/orders/:orderNo — 查单响应键", () => {
  it("培训订单：金额键与其余分支一致用 amount，无 snake 残留", async () => {
    const { GET } = await import("@/app/api/payment/orders/[orderNo]/route");
    const res = await GET(
      req("/api/payment/orders/TR20260903BBB") as never,
      { params: Promise.resolve({ orderNo: "TR20260903BBB" }) } as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(snakeKeys(body)).toEqual([]);
    expect(body).toMatchObject({ orderNo: "TR20260903BBB", status: "paid", amount: 880 });
  });
});
