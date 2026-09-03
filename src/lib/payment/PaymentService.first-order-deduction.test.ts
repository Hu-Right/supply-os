/**
 * 首单特惠与会员抵扣定价测试（2026-08-30 产品决策）
 * 1. single_99 仅限从未持有 single_% 订单（含 pending）的用户
 * 2. annual_799 在 7 天抵扣窗口内自动抵扣 single_99 已付金额（799-99=700）
 */
import { describe, it, expect, vi } from "vitest";
import type { CreateOrderRequest } from "../types/payment";
import type { PaymentsRepo } from "../repos/payments.repo";

vi.mock("server-only", () => ({}));

function makeEnv(opts: {
  hasSingleRecord?: boolean;
  deductible?: { order_no: string; amount: number; paid_at: Date } | null;
  plan?: { plan_code: string; name: string; price: number; currency: string };
}) {
  const captured: { amount?: number; rawRequest?: string; orderNo?: string } = {};
  const paymentsRepo = {
    findPendingOrder: vi.fn().mockResolvedValue(null),
    hasSingleUnlockRecord: vi.fn().mockResolvedValue(opts.hasSingleRecord ?? false),
    findDeductibleSingleOrder: vi.fn().mockResolvedValue(opts.deductible ?? null),
    findActivePlan: vi.fn().mockResolvedValue(
      opts.plan ?? { plan_code: "annual_799", name: "标讯个人会员", price: 799, currency: "CNY" },
    ),
    createOrder: vi.fn(async (args: { amount: number; rawRequest: string; orderNo: string }) => {
      captured.amount = args.amount;
      captured.rawRequest = args.rawRequest;
      return args.orderNo;
    }),
  } as unknown as PaymentsRepo;
  return { captured, paymentsRepo };
}

async function getService(paymentsRepo: PaymentsRepo) {
  const { PaymentService } = await import("./PaymentService");
  const svc = new PaymentService(paymentsRepo, undefined);
  svc.registerStrategy("mock", {
    createPaymentUrl: async () => ({ pay_url: "/pay", qr_code_url: "data:image/png;base64,x" }),
    queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
  } as never);
  return svc;
}

const req = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  user_id: 1,
  user_key: "13800000000",
  plan_code: "single_99",
  provider: "mock",
  ...over,
});

describe("single_99 首单特惠资格", () => {
  it("无单次解锁记录：99 元下单成功", async () => {
    const { captured, paymentsRepo } = makeEnv({
      hasSingleRecord: false,
      plan: { plan_code: "single_99", name: "单次解锁·首单特惠", price: 99, currency: "CNY" },
    });
    const svc = await getService(paymentsRepo);
    const order = await svc.createOrder(req({ amount: 1 }));
    expect(order.amount).toBe(99);
    expect(captured.amount).toBe(99);
  });

  it("已有 single 订单（含历史 199 买家）：409 拒绝", async () => {
    const { paymentsRepo } = makeEnv({
      hasSingleRecord: true,
      plan: { plan_code: "single_99", name: "单次解锁·首单特惠", price: 99, currency: "CNY" },
    });
    const svc = await getService(paymentsRepo);
    await expect(svc.createOrder(req())).rejects.toThrow("SINGLE_FIRST_PURCHASE_ONLY");
  });
});

describe("annual_799 首单抵扣", () => {
  it("7 天内已付 single_99：700 元成交且快照记录抵扣", async () => {
    const { captured, paymentsRepo } = makeEnv({
      deductible: { order_no: "SO-SRC-99", amount: 99, paid_at: new Date() },
    });
    const svc = await getService(paymentsRepo);
    const order = await svc.createOrder(req({ plan_code: "annual_799" }));
    expect(order.amount).toBe(700);
    const raw = JSON.parse(captured.rawRequest!);
    expect(raw.deduction).toEqual({
      source_order_no: "SO-SRC-99",
      source_amount: 99,
      base_price: 799,
    });
  });

  it("无可抵扣源（从未购买/超 7 天/已抵扣过）：原价 799", async () => {
    const { captured, paymentsRepo } = makeEnv({ deductible: null });
    const svc = await getService(paymentsRepo);
    const order = await svc.createOrder(req({ plan_code: "annual_799" }));
    expect(order.amount).toBe(799);
    const raw = JSON.parse(captured.rawRequest!);
    expect(raw.deduction).toBeUndefined();
  });

  it("升级类型的 annual_799 不走抵扣（抵扣仅限新购）", async () => {
    const { paymentsRepo } = makeEnv({
      deductible: { order_no: "SO-SRC-99", amount: 99, paid_at: new Date() },
    });
    // upgrade 需要会员 repo，这里预期先抛 UPGRADE_NOT_SUPPORTED 而非算出抵扣价
    const svc = await getService(paymentsRepo);
    await expect(
      svc.createOrder(req({ plan_code: "annual_799", order_type: "upgrade" })),
    ).rejects.toThrow();
    expect(paymentsRepo.findDeductibleSingleOrder).not.toHaveBeenCalled();
  });
});
