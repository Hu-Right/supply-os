import { describe, it, expect, vi } from "vitest";
import { ServicePaymentService } from "@/lib/payment/service-payment";
import type { PaymentStrategy } from "@/lib/payment/types";
import type { Pool } from "mysql2/promise";

const strategy: PaymentStrategy = {
  name: "mock",
  createPaymentUrl: vi.fn().mockResolvedValue({ pay_url: "/pay/mock", qr_code_url: "https://qr" }),
  verifyCallback: vi.fn(),
  queryOrderStatus: vi.fn(),
};
const resolver = { getStrategy: () => strategy };

/** pool.query 解析出目录定价行 */
function svcPool(standardPrice: string | null, isActive = 1, saleMode = "self") {
  return {
    query: vi.fn().mockResolvedValue([[{
      standard_price: standardPrice, currency: "CNY", sale_mode: saleMode, is_active: isActive, name_zh: "AI 单标解析",
    }]]),
  } as unknown as Pool;
}

function makeRepo() {
  return {
    createOrder: vi.fn().mockResolvedValue(1),
    queryStatus: vi.fn(),
    findByOrderNo: vi.fn(),
    markPaid: vi.fn().mockResolvedValue(true),
    markRefunded: vi.fn().mockResolvedValue(true),
  };
}

describe("ServicePaymentService", () => {
  it("有价服务：读库定价、写单、返回学习同款结构", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool("199.00"));
    svc.setStrategyResolver(resolver);
    const r = await svc.createOrder({ userId: 5, serviceCode: "svc_x", provider: "mock" });
    expect(r.order_no).toMatch(/^SV/);
    expect(r.amount).toBe(199);
    expect(r.qr_code_url).toBe("https://qr");
    expect(r.status).toBe("pending");
    const input = repo.createOrder.mock.calls[0][0];
    expect(input.amountTotal).toBe("199.00");
    expect(input.serviceCode).toBe("svc_x");
  });

  it("无价服务（standard_price 为空）→ 抛 SERVICE_UNAVAILABLE，不落单", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool(null));
    svc.setStrategyResolver(resolver);
    await expect(svc.createOrder({ userId: 5, serviceCode: "svc_x", provider: "mock" })).rejects.toThrow("SERVICE_UNAVAILABLE");
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it("已下架服务 → 抛 SERVICE_UNAVAILABLE", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool("199.00", 0));
    svc.setStrategyResolver(resolver);
    await expect(svc.createOrder({ userId: 5, serviceCode: "svc_x", provider: "mock" })).rejects.toThrow("SERVICE_UNAVAILABLE");
  });

  // 260928 报价表把单标陪跑/KA/API 等定为「按需报价 / 定制报价 / 面议」，目录里虽存了参考起价，
  // 但 sale_mode=contract 的商品不得进自助支付（前端已改为「预约顾问」，这里防绕过）。
  it("合同成交（sale_mode=contract）有价服务 → 拒绝下单 SERVICE_ADVISORY_ONLY", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool("26800.00", 1, "contract"));
    svc.setStrategyResolver(resolver);
    await expect(svc.createOrder({ userId: 5, serviceCode: "svc_bid_companion", provider: "mock" })).rejects.toThrow("SERVICE_ADVISORY_ONLY");
    expect(repo.createOrder).not.toHaveBeenCalled();
  });

  it("留资转化（sale_mode=lead）有价服务 → 同样拒绝自助成交", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool("880.00", 1, "lead"));
    svc.setStrategyResolver(resolver);
    await expect(svc.createOrder({ userId: 5, serviceCode: "svc_x", provider: "mock" })).rejects.toThrow("SERVICE_ADVISORY_ONLY");
  });

  it("queryOrder 读 DB status", async () => {
    const repo = makeRepo();
    repo.queryStatus.mockResolvedValue({ status: "paid", amount_total: "199.00", paid_at: null });
    const svc = new ServicePaymentService(repo as never, svcPool("199.00"));
    const r = await svc.queryOrder("SV1");
    expect(r?.status).toBe("paid");
    expect(r?.amount).toBe(199);
  });

  it("fulfillOrder 标已付", async () => {
    const repo = makeRepo();
    const svc = new ServicePaymentService(repo as never, svcPool("199.00"));
    await svc.fulfillOrder("SV1");
    expect(repo.markPaid).toHaveBeenCalledWith("SV1");
  });

  it("queryOrder：DB pending + mock 网关 paid → 回查并补标 paid", async () => {
    const repo = makeRepo();
    repo.queryStatus.mockResolvedValue({ status: "pending", amount_total: "199.00", paid_at: null });
    const qs = vi.fn().mockResolvedValue({ status: "paid" });
    const svc = new ServicePaymentService(repo as never, svcPool("199.00"));
    svc.setStrategyResolver({ getStrategy: () => ({ queryOrderStatus: qs } as unknown as PaymentStrategy) });
    const r = await svc.queryOrder("SV1");
    expect(qs).toHaveBeenCalledWith("SV1");
    expect(repo.markPaid).toHaveBeenCalledWith("SV1");
    expect(r?.status).toBe("paid");
  });
});
