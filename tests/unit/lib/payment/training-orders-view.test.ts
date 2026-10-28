/**
 * 培训订单两个端点的 wire 键集合取证（命名红线② C 组最后两条）。
 *
 * 这两条登记项停在 C 的理由是「查单/建单都触外部支付网关，只读探针跑不了」。
 * 但键名其实不需要真打网关就能钉：TrainingPaymentService 的 createOrder/queryOrder
 * 都是**显式列字段 return**（网关返回的 pay_url / qr_code_url / provider_trade_no
 * 在方法内被取成局部变量再装进 camel 键，没有 {...gateway} 展开），
 * 所以用假 repo + 假 strategy 在进程内跑就行——不连库、不打网关、不写任何数据。
 * 这里断言的是「网关字段不会原名上网」，因为那正是这两个端点唯一的 snake 来源。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TrainingPaymentService } from "@/lib/payment/TrainingPaymentService";
import { ORDER_STATUS } from "@/shared/constants/order-status";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getActiveCourse: vi.fn(async () => ({ id: 1, name_zh: "零碳园区实务课", unit_price: 100, currency: "CNY" })),
    findScheduleById: vi.fn(async () => ({ id: 2, capacity: 10, enrolled_count: 1 })),
    createOrder: vi.fn(async () => undefined),
    findOrderByNo: vi.fn(async () => null),
    updateOrderStatus: vi.fn(async () => undefined),
    ...overrides,
  } as never;
}

/** 假策略：网关返回的全是列名口径键，正好用来验证它们穿不出服务出口 */
function makeStrategy(queryStatus: string = ORDER_STATUS.PENDING) {
  return {
    createPaymentUrl: vi.fn(async () => ({ pay_url: "https://gateway/pay/1", qr_code_url: "https://gateway/qr/1" })),
    queryOrderStatus: vi.fn(async () => ({ status: queryStatus, provider_trade_no: "gw-trade-9" })),
  };
}

function wire(strategy: ReturnType<typeof makeStrategy>, repo: never) {
  const service = new TrainingPaymentService(repo);
  service.setStrategyResolver({
    getStrategy: () => strategy as never,
    hasStrategy: () => true,
    paymentMode: "mock",
  });
  return service;
}

describe("POST /api/training/orders（createOrder）", () => {
  it("返回 8 个 camel 键；网关的 pay_url/qr_code_url 不原名上网", async () => {
    const strategy = makeStrategy();
    const service = wire(strategy, makeRepo());

    const result = await service.createOrder({
      scheduleId: 2,
      participantCount: 2,
      provider: "alipay",
      contactName: "张三",
      telephone: "13800000000",
      clientIp: "127.0.0.1",
      baseUrl: "http://localhost:3000",
    });

    expect([...Object.keys(result)].sort()).toEqual(
      [...["orderNo", "provider", "amount", "currency", "qrCodeUrl", "payUrl", "status", "expiresAt"]].sort(),
    );
    expect(Object.keys(result).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(result.amount).toBe(200);
    expect(result.status).toBe(ORDER_STATUS.PENDING);
    expect(result.payUrl).toBe("https://gateway/pay/1");
    // 二维码已被转成 data URL（值加工），但键仍是 qrCodeUrl
    expect(String(result.qrCodeUrl)).toMatch(/^data:image\/(png|jpeg);base64,/);
  });

  it("写库调用用的是 camel 入参（列名映射留给 repo）", async () => {
    const createOrderDb = vi.fn(async (_input: Record<string, unknown>) => undefined);
    const service = wire(makeStrategy(), makeRepo({ createOrder: createOrderDb }) as never);

    await service.createOrder({
      participantCount: 1,
      provider: "alipay",
      clientIp: "127.0.0.1",
      baseUrl: "http://localhost:3000",
    });

    expect(createOrderDb).toHaveBeenCalledTimes(1);
    const input = createOrderDb.mock.calls[0][0];
    expect(Object.keys(input).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });
});

describe("GET /api/training/orders/:orderNo（queryOrder）", () => {
  it("本地 pending 且已过有效期：网关回 pending → 4 个 camel 键，paidAt=null，网关字段不外泄", async () => {
    const past = new Date(Date.now() - 60_000);
    const repo = makeRepo({
      findOrderByNo: vi.fn(async () => ({
        order_no: "TR1",
        status: ORDER_STATUS.PENDING,
        total_amount: 100,
        paid_at: null,
        provider: "mock",
        provider_trade_no: "gw-trade-1",
        expires_at: past,
      })),
    });
    const strategy = makeStrategy(ORDER_STATUS.PENDING);
    const service = wire(strategy, repo as never);

    const res = await service.queryOrder("TR1");
    expect(res).toEqual({ orderNo: "TR1", status: ORDER_STATUS.EXPIRED, amount: 100, paidAt: null });
    expect(Object.keys(res).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(strategy.queryOrderStatus).toHaveBeenCalledTimes(1);
  });

  it("已是 paid 的订单不再查网关（少一次外部调用），paidAt 由列值转 ISO", async () => {
    const repo = makeRepo({
      findOrderByNo: vi.fn(async () => ({
        order_no: "TR2",
        status: ORDER_STATUS.PAID,
        total_amount: 250,
        paid_at: new Date("2026-10-01T02:00:00Z"),
        provider: "mock",
        provider_trade_no: null,
        expires_at: new Date("2026-10-01T03:00:00Z"),
      })),
    });
    const strategy = makeStrategy();
    const service = wire(strategy, repo as never);

    const res = await service.queryOrder("TR2");
    expect(res).toEqual({
      orderNo: "TR2",
      status: ORDER_STATUS.PAID,
      amount: 250,
      paidAt: "2026-10-01T02:00:00.000Z",
    });
    expect(strategy.queryOrderStatus).not.toHaveBeenCalled();
  });

  it("网关回 paid：先履约再返回，仍是同样 4 键（provider_trade_no 不上网）", async () => {
    const repo = makeRepo({
      findOrderByNo: vi.fn(async () => ({
        order_no: "TR3",
        status: ORDER_STATUS.PENDING,
        total_amount: 100,
        paid_at: null,
        provider: "mock",
        provider_trade_no: "gw-trade-3",
        expires_at: new Date(Date.now() + 600_000),
      })),
    });
    const strategy = makeStrategy(ORDER_STATUS.PAID);
    const service = wire(strategy, repo as never);
    const fulfill = vi.spyOn(service, "fulfillOrder").mockResolvedValue(undefined);

    const res = await service.queryOrder("TR3");
    expect([...Object.keys(res)].sort()).toEqual(["amount", "orderNo", "paidAt", "status"].sort());
    expect(Object.keys(res).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(res.status).toBe(ORDER_STATUS.PAID);
    // 履约用的是【网关回传】的流水号（gw-trade-9），不是库里的旧值（gw-trade-3）；
    // 但这个值只往服务内部走，不会以 provider_trade_no 的名字出现在响应里。
    expect(fulfill).toHaveBeenCalledWith("TR3", "gw-trade-9");
  });
});
