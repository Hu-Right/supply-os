import { describe, it, expect } from "vitest";
import { MockProvider } from "@/lib/payment/MockProvider";

describe("MockProvider", () => {
  const provider = new MockProvider();

  it("name = mock", () => {
    expect(provider.name).toBe("mock");
  });

  it("createPaymentUrl → 返回 pay_url", async () => {
    const result = await provider.createPaymentUrl("ORD-001", 100, "测试订单");
    expect(result.pay_url).toContain("ORD-001");
    expect(result.pay_url).toContain("100");
  });

  it("queryOrderStatus → 创建后为 pending", async () => {
    await provider.createPaymentUrl("ORD-002", 200, "测试");
    const status = await provider.queryOrderStatus("ORD-002");
    expect(status.status).toBe("pending");
    expect(status.provider_trade_no).toBeTruthy();
  });

  it("queryOrderStatus → 不存在的订单为 closed", async () => {
    const status = await provider.queryOrderStatus("NON-EXISTENT");
    expect(status.status).toBe("closed");
  });

  it("verifyCallback → 始终返回 verified=true", async () => {
    const result = await provider.verifyCallback({}, "");
    expect(result.verified).toBe(true);
    expect(result.order_no).toBe("mock_order");
  });

  it("5 秒后自动支付", async () => {
    vi.useFakeTimers();
    await provider.createPaymentUrl("ORD-AUTO", 50, "自动支付");

    // 立即查询 → pending
    let status = await provider.queryOrderStatus("ORD-AUTO");
    expect(status.status).toBe("pending");

    // 快进 5 秒
    vi.advanceTimersByTime(5000);

    status = await provider.queryOrderStatus("ORD-AUTO");
    expect(status.status).toBe("paid");

    vi.useRealTimers();
  });
});
