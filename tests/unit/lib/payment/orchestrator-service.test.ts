import { describe, it, expect, vi } from "vitest";
import { PaymentOrchestrator, getOrderBusiness, ORDER_PREFIX } from "@/lib/payment/orchestrator";

vi.mock("server-only", () => ({}));

describe("getOrderBusiness — 服务订单前缀", () => {
  it("SV 前缀 → service", () => {
    expect(ORDER_PREFIX.SERVICE).toBe("SV");
    expect(getOrderBusiness("SV20260923A1B2C3")).toBe("service");
  });
  it("不误判其他前缀", () => {
    expect(getOrderBusiness("LE20260923ABC")).toBe("learning");
    expect(getOrderBusiness("SO20260923ABC")).toBe("membership");
    expect(getOrderBusiness("TR20260923ABC")).toBe("training");
  });
});

/**
 * 订单响应体形状红线（命名红线②）。
 *
 * 为什么要测：GET /api/payment/orders 的 list 元素由 orchestrator 整块透出，
 * 静态门禁只看得见 route.ts 里的显式字面量键，看不见这种“物件直接 json 出去”
 * 的形态，所以这一层的键名必须由断言守住。
 */
const SNAKE_KEY = /[a-z0-9]_[a-z0-9]/;
const expectNoSnakeKeys = (value: unknown, label: string) => {
  const keys = Object.keys(value as object);
  expect(keys.length, label).toBeGreaterThan(0);
  expect(keys.filter((k) => SNAKE_KEY.test(k)), `${label} 不得出现 snake_case 键`).toEqual([]);
};

function makeOrchestrator(opts: {
  membershipRows?: unknown[];
  trainingRow?: Record<string, unknown> | null;
}) {
  const rows = opts.membershipRows ?? [{
    order_no: "SO1", user_id: 7, provider: "alipay", plan_code: "pro",
    notice_id: 5, amount: "999.00", currency: "CNY", status: "paid",
    provider_trade_no: "T1", paid_at: new Date("2026-09-03T08:00:00Z"),
    created_at: new Date("2026-09-03T07:00:00Z"), updated_at: null,
  }];
  const noop = async () => undefined;
  const orch = new PaymentOrchestrator(
    { queryOrder: noop } as never,
    { queryOrder: noop } as never,
    { findByOrderNo: async () => null } as never,
    { findByUserId: async () => [], countByUserId: async () => 0 } as never,
    {
      findOrdersByUserId: async () => [],
      countOrdersByUserId: async () => 0,
      findOrderByNo: async () => opts.trainingRow ?? null,
    } as never,
    { queryOrder: noop } as never,
    { findByUserId: async () => [], countByUserId: async () => 0 } as never,
    { listOrders: async () => rows, countOrders: async () => rows.length } as never,
    {} as never,
  );
  return orch;
}

describe("订单响应体命名红线（整块透出部分）", () => {
  it("listAllOrders 的行键全为 camelCase（DB 列名不得外泄）", async () => {
    const orch = makeOrchestrator({});
    const { total, list } = await orch.listAllOrders(7, "all", 20, 0);
    expect(total).toBe(1);
    expectNoSnakeKeys(list[0], "list 元素");
    // 值仍是原列值（本批改的是键名，不改时间/金额格式）
    expect(list[0]).toMatchObject({
      orderNo: "SO1", userId: 7, businessType: "membership", planCode: "pro",
      noticeId: 5, providerTradeNo: "T1", amount: 999,
    });
    expect(list[0].createdAt).toBe(new Date("2026-09-03T07:00:00Z").toISOString());
  });

  it("培训查单分支与其余三个分支同名同形（orderNo/status/amount/paidAt）", async () => {
    const orch = makeOrchestrator({
      trainingRow: {
        order_no: "TR1", status: "paid", total_amount: "880.00",
        paid_at: new Date("2026-09-03T08:00:00Z"),
      },
    });
    const result = await orch.queryOrder("TR1");
    expectNoSnakeKeys(result, "培训查单结果");
    expect(result).toMatchObject({
      orderNo: "TR1", status: "paid", amount: 880,
      paidAt: new Date("2026-09-03T08:00:00Z").toISOString(),
    });
  });

  it("培训订单不存在 → 仍返 camel 的 orderNo", async () => {
    const orch = makeOrchestrator({ trainingRow: null });
    const result = await orch.queryOrder("TR_MISSING");
    expectNoSnakeKeys(result, "培训查单未命中结果");
    expect(result).toMatchObject({ orderNo: "TR_MISSING", status: "closed" });
  });
});
