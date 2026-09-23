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
function svcPool(standardPrice: string | null, isActive = 1) {
  return {
    query: vi.fn().mockResolvedValue([[{
      standard_price: standardPrice, currency: "CNY", sale_mode: "self", is_active: isActive,
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
});
