/**
 * PaymentService.queryOrder 管道委托 + createOrder return_url 白名单（架构评估 P0-T1 续 · 新契约迁移）
 *
 * 迁移说明：旧文件覆盖 createOrder(upgrade via MembershipRepo)/initDefault/fulfillMockPayment，
 * 这些 API 已随单轨改造移除——升级差价/快照逻辑改由 previewUpgrade + performUpgradeInTransaction
 * 承担（见 membership-upgrade.test.ts、benefit-upgrade.test.ts），initDefault 收归 Orchestrator。
 * 本文件仅保留新 PaymentService 未被覆盖的两块核心行为：
 * - queryOrder 委托统一查询管道（不存在→closed；pending 轮询 paid→履约；渠道异常→保持 DB 态）；
 * - createOrder return_url 白名单（审查 F26：外域丢弃、同源相对路径回填订单参数）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payment/reverse", () => ({ reverseFulfilledOrder: vi.fn() }));
vi.mock("@/lib/payment/activate", () => ({ activatePaidOrder: vi.fn() }));

import { activatePaidOrder } from "@/lib/payment/activate";
import { PaymentService } from "@/lib/payment/PaymentService";

/** 明码在售套餐（createOrder 服务端定价读 benefitDeps.catalog.getPlan）。 */
const sellablePlan = {
  plan_code: "pro", name_zh: "专业版", price: "999.00", currency: "CNY",
  is_active: 1, price_mode: "fixed",
};
const benefitDeps = { catalog: { getPlan: vi.fn(async () => sellablePlan) }, write: {} };

const dbOrder = (over: Record<string, unknown> = {}) => ({
  order_no: "SO1", status: "pending", provider: "mock", plan_code: "pro",
  amount: 999, currency: "CNY", notice_id: 5, provider_trade_no: null, paid_at: null,
  ...over,
});

function makeRepo(order: Record<string, unknown> | null) {
  return {
    findByOrderNo: vi.fn().mockResolvedValue(order),
    findPendingOrder: vi.fn().mockResolvedValue(null),
    createOrder: vi.fn(async (args: { orderNo: string }) => args.orderNo),
    updatePendingOrder: vi.fn(),
    findOrderAmount: vi.fn().mockResolvedValue(null),
  } as unknown as PaymentsRepo;
}

async function getService(
  repo: PaymentsRepo,
  opts?: { queryStatus?: Record<string, unknown>; queryThrows?: boolean },
) {
  const svc = new PaymentService(repo, benefitDeps as never);
  const _s = {
    createPaymentUrl: vi.fn(async (_no: string, _a: number, _n: string, returnUrl: string) => ({ pay_url: "/pay", qr_code_url: returnUrl ? `x?${returnUrl}` : "x", __returnUrl: returnUrl })),
    queryOrderStatus: vi.fn(async () => {
      if (opts?.queryThrows) throw new Error("GATEWAY_DOWN");
      return opts?.queryStatus ?? { order_no: "", status: "pending" };
    }),
    verifyCallback: vi.fn(),
  } as never;
  svc.setStrategyResolver({ getStrategy: () => _s, hasStrategy: () => true });
  return { svc, strategy: _s as unknown as { createPaymentUrl: ReturnType<typeof vi.fn> } };
}

describe("PaymentService.queryOrder（委托统一查询管道）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("订单不存在 → closed", async () => {
    const { svc } = await getService(makeRepo(null));
    expect(await svc.queryOrder("SOX")).toMatchObject({ order_no: "SOX", status: "closed" });
  });

  it("pending + 渠道轮询返回 paid → 主动履约并返回渠道结果快照", async () => {
    const repo = makeRepo(dbOrder());
    const { svc } = await getService(repo, {
      queryStatus: { order_no: "SO1", status: "paid", provider_trade_no: "T9" },
    });
    const result = await svc.queryOrder("SO1");
    // onFulfill → activatePaidOrder(repo, orderNo, providerTradeNo, benefitDeps)
    expect(activatePaidOrder).toHaveBeenCalledWith(repo, "SO1", "T9", benefitDeps);
    expect(result).toMatchObject({ status: "paid", plan_code: "pro", amount: 999 });
  });

  it("pending + 渠道判定失败（非 paid 非 pending）→ 透传渠道结果，不履约", async () => {
    const { svc } = await getService(makeRepo(dbOrder()), {
      queryStatus: { order_no: "SO1", status: "failed" },
    });
    const result = await svc.queryOrder("SO1");
    expect(activatePaidOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed" });
  });

  it("pending + 渠道仍 pending → 返回 DB 快照", async () => {
    const { svc } = await getService(makeRepo(dbOrder()), {
      queryStatus: { order_no: "SO1", status: "pending" },
    });
    expect(await svc.queryOrder("SO1")).toMatchObject({ status: "pending", provider: "mock" });
  });

  it("pending + 渠道轮询抛错 → 捕获后保持 DB 状态（渠道不可用不误判）", async () => {
    const { svc } = await getService(makeRepo(dbOrder()), { queryThrows: true });
    const result = await svc.queryOrder("SO1");
    expect(result.status).toBe("pending");
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("已支付订单（非 pending）→ 直接返回 DB 快照，paid_at 转 ISO", async () => {
    const paidAt = new Date("2026-09-03T08:00:00Z");
    const { svc } = await getService(makeRepo(dbOrder({ status: "paid", provider_trade_no: "T1", paid_at: paidAt })));
    const result = await svc.queryOrder("SO1");
    expect(result).toMatchObject({ status: "paid", provider_trade_no: "T1" });
    expect(result.paid_at).toBe(paidAt.toISOString());
  });
});

describe("PaymentService.createOrder — return_url 白名单（F26）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("外域 return_url → 丢弃（下单仍成功，不携带订单参数）", async () => {
    const { svc, strategy } = await getService(makeRepo(null));
    await svc.createOrder({ user_id: 1, plan_code: "pro", provider: "mock", return_url: "https://evil.example/phish" } as never);
    const returnUrlArg = String(strategy.createPaymentUrl.mock.calls[0][3]);
    expect(returnUrlArg).not.toContain("order_no");
  });

  it("同源 return_url 带 hash → 订单参数插入 # 之前", async () => {
    const { svc, strategy } = await getService(makeRepo(null));
    await svc.createOrder({ user_id: 1, plan_code: "pro", provider: "mock", return_url: "/pay#sec" } as never);
    const returnUrlArg = String(strategy.createPaymentUrl.mock.calls[0][3]);
    expect(returnUrlArg).toMatch(/^\/pay\?order_no=SO\d+.*#sec$/);
  });
});

describe("PaymentService.fulfillMockMembershipOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("委托 activatePaidOrder 并透传 benefitDeps 与 rawNotify", async () => {
    vi.mocked(activatePaidOrder).mockResolvedValue(true as never);
    const repo = makeRepo(dbOrder());
    const svc = new PaymentService(repo, benefitDeps as never);
    expect(await svc.fulfillMockMembershipOrder("SO1", "raw")).toBe(true);
    expect(activatePaidOrder).toHaveBeenCalledWith(repo, "SO1", undefined, benefitDeps, "raw");
  });
});
