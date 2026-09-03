/**
 * PaymentService.handleNotify 回调分支全覆盖（架构评估 P0-T1）
 *
 * 钱路核心分支：
 * - 验签失败拒绝（SIGN_VERIFY_FAILED）
 * - TRADE_CLOSED 退款通知路由（审查 F20）：不得履约也不得丢弃
 * - 回调金额校验（P1-4）：缺失/0 拒绝、与订单不符拒绝
 * - 未知订单拒绝（原实现静默放行导致通知永久丢失的回归保护）
 * - 成功路径激活履约
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payment/reverse", () => ({ reverseFulfilledOrder: vi.fn() }));
vi.mock("@/lib/payment/fulfillment", () => ({ activatePaidOrder: vi.fn() }));

import { reverseFulfilledOrder } from "@/lib/payment/reverse";
import { activatePaidOrder } from "@/lib/payment/fulfillment";
import { PaymentService } from "@/lib/payment/PaymentService";

function makeRepo(orderAmount: { amount: number; status: string } | null) {
  return {
    findOrderAmount: vi.fn().mockResolvedValue(orderAmount),
  } as unknown as PaymentsRepo;
}

async function getService(repo: PaymentsRepo, verifyResult: Record<string, unknown>) {
  const { PaymentService: Svc } = await import("@/lib/payment/PaymentService");
  const svc = new Svc(repo, undefined);
  svc.registerStrategy("mock", {
    createPaymentUrl: async () => ({ pay_url: "/pay", qr_code_url: "x" }),
    queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
    verifyCallback: vi.fn().mockResolvedValue(verifyResult),
  } as never);
  return svc;
}

const baseVerified = { verified: true, order_no: "SO1", amount: "99", provider_trade_no: "T1" };

describe("PaymentService.handleNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("验签失败 → SIGN_VERIFY_FAILED，不触达履约", async () => {
    const repo = makeRepo(null);
    const svc = await getService(repo, { verified: false, order_no: "SO1" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, message: "SIGN_VERIFY_FAILED" });
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("F20：TRADE_CLOSED 且订单已履约 → 路由到权益逆向并报 REFUND_REVERSED", async () => {
    const repo = makeRepo(null);
    vi.mocked(reverseFulfilledOrder).mockResolvedValue({ found: true, reversed: true });
    const svc = await getService(repo, { verified: false, order_no: "SO1", tradeStatus: "TRADE_CLOSED" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(reverseFulfilledOrder).toHaveBeenCalledWith(repo, "SO1");
    expect(result).toMatchObject({ success: true, order_no: "SO1", message: "REFUND_REVERSED" });
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("F20：TRADE_CLOSED 无可回收动作 → REFUND_NO_ACTION 仍算成功（停止重试）", async () => {
    const repo = makeRepo(null);
    vi.mocked(reverseFulfilledOrder).mockResolvedValue({ found: true, reversed: false });
    const svc = await getService(repo, { verified: false, order_no: "SO1", tradeStatus: "TRADE_CLOSED" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result.message).toBe("REFUND_NO_ACTION");
  });

  it("F20：TRADE_CLOSED 但订单不存在 → ORDER_NOT_FOUND", async () => {
    const repo = makeRepo(null);
    vi.mocked(reverseFulfilledOrder).mockResolvedValue({ found: false, reversed: false });
    const svc = await getService(repo, { verified: false, order_no: "SOX", tradeStatus: "TRADE_CLOSED" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, message: "ORDER_NOT_FOUND" });
  });

  it("TRADE_CLOSED 缺 order_no → ORDER_NO_MISSING", async () => {
    const repo = makeRepo(null);
    const svc = await getService(repo, { verified: false, tradeStatus: "TRADE_CLOSED" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, order_no: "", message: "ORDER_NO_MISSING" });
  });

  it("回调金额缺失或为 0 → AMOUNT_INVALID（防伪造 body 跳过金额比对）", async () => {
    const repo = makeRepo({ amount: 99, status: "pending" });
    const svc = await getService(repo, { verified: true, order_no: "SO1", amount: "" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, message: "AMOUNT_INVALID" });
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("未知订单 → ORDER_NOT_FOUND（回归保护：原实现静默放行）", async () => {
    const repo = makeRepo(null);
    const svc = await getService(repo, { verified: true, order_no: "SOX", amount: "99" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, order_no: "SOX", message: "ORDER_NOT_FOUND" });
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("回调金额与订单不符（>0.01 容差外）→ AMOUNT_MISMATCH", async () => {
    const repo = makeRepo({ amount: 799, status: "pending" });
    const svc = await getService(repo, { verified: true, order_no: "SO1", amount: "99" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, message: "AMOUNT_MISMATCH" });
  });

  it("金额容差内（分位四舍五入）→ 履约成功", async () => {
    const repo = makeRepo({ amount: 99, status: "pending" });
    const svc = await getService(repo, { verified: true, order_no: "SO1", amount: "99.005", provider_trade_no: "T9" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: true, order_no: "SO1" });
    // activatePaidOrder(repo, orderNo, providerTradeNo)
    expect(activatePaidOrder).toHaveBeenCalledWith(repo, "SO1", "T9");
  });

  it("验签通过但缺 order_no → ORDER_NO_MISSING", async () => {
    const repo = makeRepo(null);
    const svc = await getService(repo, { verified: true, amount: "99" });
    const result = await svc.handleNotify("mock", {}, "sig");
    expect(result).toMatchObject({ success: false, order_no: "", message: "ORDER_NO_MISSING" });
  });
});
