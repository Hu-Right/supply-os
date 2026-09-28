/**
 * 年包抵扣下单侧行为（260928 报价表「199 升级年包可全额抵扣」在 PaymentService 的落实）。
 *
 * 钉住四件事，缺一件就会变成"对客承诺了却收错钱"：
 * 1) 有可用抵扣单时按「套餐价 − 服务单成交快照价」收，并把服务单号写进 original_order_no 作核销锚点；
 * 2) 抵扣单**不复用**历史 pending 订单（updatePendingOrder 不回写锚点，复用＝一张单反复抵扣）；
 * 3) 非年付档不抵扣；币种不一致不抵扣；
 * 4) upgrade 路径由 previewUpgrade 裁决，窗口关闭的错误码原样抛出（不静默降级成原价 upgrade 单）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payment/reverse", () => ({ reverseFulfilledOrder: vi.fn() }));
vi.mock("@/lib/payment/activate", () => ({ activatePaidOrder: vi.fn() }));

const previewUpgrade = vi.fn();
vi.mock("@/lib/services/membership-upgrade", () => ({ previewUpgrade: (...a: unknown[]) => previewUpgrade(...a) }));

import { PaymentService } from "@/lib/payment/PaymentService";

const ANNUAL_PLAN = {
  plan_code: "business", name_zh: "企业年度会员", price: "8800.00", currency: "CNY",
  is_active: 1, price_mode: "fixed", billing_period_days: 365, upgrade_credit_days: null,
};
/** 非年付档（一次性/按合同）：文档的"年包抵扣"不适用于它 */
const ONE_OFF_PLAN = { ...ANNUAL_PLAN, billing_period_days: null };
const CREDIT_SV = { order_no: "SV1", amount: "199.00", currency: "CNY" };

function makeRepo(plan: Record<string, unknown>, credit: { order_no: string; amount: string; currency: string } | null) {
  const repo = {
    findByOrderNo: vi.fn().mockResolvedValue(null),
    findPendingOrder: vi.fn().mockResolvedValue({ order_no: "SO_OLD" }),
    findUsableAnnualPlanCredit: vi.fn().mockResolvedValue(credit),
    createOrder: vi.fn(async () => undefined),
    updatePendingOrder: vi.fn(),
    findOrderAmount: vi.fn().mockResolvedValue(null),
  } as unknown as PaymentsRepo;
  const svc = new PaymentService(repo, {
    catalog: { getPlan: vi.fn(async () => plan) }, write: {},
  } as never);
  svc.setStrategyResolver({
    getStrategy: () => ({ createPaymentUrl: vi.fn(async () => ({ pay_url: "/pay", qr_code_url: "qr" })) } as never),
    hasStrategy: () => true,
  });
  return { svc, repo };
}

const order = (planCode = "business") => ({
  user_id: 7, plan_code: planCode, provider: "mock" as const,
});

beforeEach(() => { vi.clearAllMocks(); });

describe("年包抵扣（199 → 年付套餐）", () => {
  it("有可用抵扣单：按 8800−199 收款，并以服务单号为核销锚点", async () => {
    const { svc, repo } = makeRepo(ANNUAL_PLAN, CREDIT_SV);
    const r = await svc.createOrder(order());
    expect(r.amount).toBe(8601);
    const input = vi.mocked(repo.createOrder).mock.calls[0][0];
    expect(input.amount).toBe(8601);
    expect(input.originalOrderNo).toBe("SV1");
    expect(input.orderType).toBe("new");
    // 抵扣单必须新开，不复用历史 pending 单
    expect(repo.updatePendingOrder).not.toHaveBeenCalled();
  });

  it("raw_request 留抵扣快照，履约与对账可回查", async () => {
    const { svc, repo } = makeRepo(ANNUAL_PLAN, CREDIT_SV);
    await svc.createOrder(order());
    const payload = JSON.parse(vi.mocked(repo.createOrder).mock.calls[0][0].rawRequest);
    expect(payload.annual_plan_credit_snapshot).toEqual({ credit_order_no: "SV1", credit_amount: 199, payable: 8601 });
  });

  it("无可用抵扣单：原价 8800，不写锚点，且允许复用历史 pending 单", async () => {
    const { svc, repo } = makeRepo(ANNUAL_PLAN, null);
    vi.mocked(repo.findPendingOrder).mockResolvedValueOnce({ order_no: "SO_OLD" } as never);
    const r = await svc.createOrder(order());
    expect(r.amount).toBe(8800);
    expect(r.order_no).toBe("SO_OLD");
    expect(repo.updatePendingOrder).toHaveBeenCalled();
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it("无可用抵扣单且无 pending 单：新开单并留空锚点", async () => {
    const { svc, repo } = makeRepo(ANNUAL_PLAN, null);
    vi.mocked(repo.findPendingOrder).mockResolvedValueOnce(null as never);
    await svc.createOrder(order());
    expect(vi.mocked(repo.createOrder).mock.calls[0][0].originalOrderNo).toBeNull();
  });

  it("非年付档不查抵扣单", async () => {
    const { svc, repo } = makeRepo(ONE_OFF_PLAN, CREDIT_SV);
    const r = await svc.createOrder(order());
    expect(r.amount).toBe(8800);
    expect(repo.findUsableAnnualPlanCredit).not.toHaveBeenCalled();
  });

  it("抵扣单币种与套餐不一致 → 不抵扣（跨币种折价无依据）", async () => {
    const { svc } = makeRepo(ANNUAL_PLAN, { ...CREDIT_SV, currency: "USD" });
    expect((await svc.createOrder(order())).amount).toBe(8800);
  });

  it("抵扣额 ≥ 套餐价 → 不抵扣（抵扣不是白送渠道）", async () => {
    const { svc } = makeRepo({ ...ANNUAL_PLAN, price: "99.00" }, CREDIT_SV);
    expect((await svc.createOrder(order())).amount).toBe(99);
  });
});

describe("升级抵扣窗口在下单侧的裁决", () => {
  it("窗口关闭：透传 UPGRADE_CREDIT_WINDOW_CLOSED，不落任何订单", async () => {
    previewUpgrade.mockResolvedValueOnce({
      can_upgrade: false, reason: "UPGRADE_CREDIT_WINDOW_CLOSED", subscription: null, current_plan: null,
      price_difference: 8800, new_purchase_price: 8800,
    });
    const { svc, repo } = makeRepo(ANNUAL_PLAN, null);
    await expect(svc.createOrder({ ...order(), order_type: "upgrade" as const })).rejects.toThrow("UPGRADE_CREDIT_WINDOW_CLOSED");
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it("窗口内：按补差价落 upgrade 单并记录来源单号", async () => {
    previewUpgrade.mockResolvedValueOnce({
      can_upgrade: true, reason: null, price_difference: 7801,
      subscription: { subscription_id: 9, source_order_no: "SO_SRC" },
      current_plan: { plan_code: "pro", price: "999.00" },
    });
    const { svc, repo } = makeRepo(ANNUAL_PLAN, CREDIT_SV);
    const r = await svc.createOrder({ ...order(), order_type: "upgrade" as const });
    expect(r.amount).toBe(7801);
    // upgrade 路径不吃年包抵扣（两条抵扣不叠加，且锚点已被来源单号占用）
    expect(repo.findUsableAnnualPlanCredit).not.toHaveBeenCalled();
    expect(vi.mocked(repo.createOrder).mock.calls[0][0].originalOrderNo).toBe("SO_SRC");
  });
});
