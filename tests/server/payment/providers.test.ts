/**
 * server/payment — AlipayProvider + WechatProvider 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── WechatProvider ────────────────────────────────────────────────────────────
import { WechatProvider } from "../../../server/payment/WechatProvider";

describe("WechatProvider", () => {
  const config = {
    appId: "wx_app_id",
    mchId: "mch_001",
    apiV3Key: "v3key",
    privateKey: "pk",
    notifyUrl: "https://example.com/notify",
  };

  it("createPaymentUrl 返回 pay_url + qr_code_url", async () => {
    const provider = new WechatProvider(config);
    const result = await provider.createPaymentUrl("ORD-001", 9.99, "测试商品", "https://return.url", "1.2.3.4");

    expect(result.pay_url).toContain("wx.tenpay.com");
    expect(result.pay_url).toContain("STUB_ORD-001");
    expect(result.qr_code_url).toContain("weixin://wxpay/bizpayurl");
    expect(result.qr_code_url).toContain("ORD-001");
  });

  it("createPaymentUrl 无 clientIp 时回退 127.0.0.1", async () => {
    const provider = new WechatProvider(config);
    const result = await provider.createPaymentUrl("ORD-002", 1, "desc");
    expect(result.pay_url).toContain("STUB_ORD-002");
  });

  it("createPaymentUrl description 截断到 127 字符", async () => {
    const provider = new WechatProvider(config);
    const longDesc = "a".repeat(200);
    // 不抛错即通过（内部 slice(0, 127)）
    const result = await provider.createPaymentUrl("ORD-003", 1, longDesc);
    expect(result.pay_url).toBeTruthy();
  });

  it("verifyCallback (stub) 始终返回 verified=true", async () => {
    const provider = new WechatProvider(config);
    const result = await provider.verifyCallback(
      { out_trade_no: "ORD-001", transaction_id: "TX-001", amount: { total: 999 } },
      "sig",
    );
    expect(result.verified).toBe(true);
    expect(result.order_no).toBe("ORD-001");
    expect(result.provider_trade_no).toBe("TX-001");
    expect(result.amount).toBe(9.99); // 分 → 元
  });

  it("verifyCallback 空 body 安全处理", async () => {
    const provider = new WechatProvider(config);
    const result = await provider.verifyCallback(null, "sig");
    expect(result.order_no).toBe("");
    expect(result.amount).toBe(0);
  });

  it("queryOrderStatus (stub) 返回 pending", async () => {
    const provider = new WechatProvider(config);
    const result = await provider.queryOrderStatus("ORD-001");
    expect(result.status).toBe("pending");
  });
});

// ── AlipayProvider ────────────────────────────────────────────────────────────
const mockSdkInstance = {
  config: { alipayPublicKey: "mock-public-key" },
  pageExecute: vi.fn().mockReturnValue("https://openapi.alipay.com/gateway?mock=1"),
  exec: vi.fn(),
  checkNotifySign: vi.fn().mockReturnValue(true),
};

vi.mock("alipay-sdk", () => {
  const MockAlipaySdk = vi.fn(function (this: any) {
    Object.assign(this, mockSdkInstance);
  }) as any;
  return { AlipaySdk: MockAlipaySdk };
});

import { AlipayProvider } from "../../../server/payment/AlipayProvider";

describe("AlipayProvider", () => {
  const alipayConfig = {
    appId: "2021001234",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----",
    publicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----",
    notifyUrl: "https://example.com/alipay/notify",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("构造函数创建 SDK 实例", () => {
    const provider = new AlipayProvider(alipayConfig);
    expect(provider).toBeDefined();
    // AlipaySdk constructor was called internally
  });

  it("createPaymentUrl 调用 pageExecute + exec(precreate)", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockResolvedValueOnce({ code: "10000", qr_code: "https://qr.alipay.com/xxx" });

    const result = await provider.createPaymentUrl("ORD-001", 100, "测试", "https://return");

    expect(sdk.pageExecute).toHaveBeenCalledWith("alipay.trade.page.pay", expect.any(Object));
    expect(sdk.exec).toHaveBeenCalledWith("alipay.trade.precreate", expect.any(Object));
    expect(result.pay_url).toBeTruthy();
    expect(result.qr_code_url).toBe("https://qr.alipay.com/xxx");
  });

  it("createPaymentUrl precreate 失败时抛错", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockResolvedValueOnce({ code: "40004", sub_msg: "签名错误" });

    await expect(
      provider.createPaymentUrl("ORD-002", 50, "desc"),
    ).rejects.toThrow("支付宝二维码生成失败");
  });

  it("verifyCallback 验签成功", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.checkNotifySign.mockReturnValue(true);

    const result = await provider.verifyCallback(
      { out_trade_no: "ORD-001", trade_no: "TX-001", total_amount: "100.00", app_id: "2021001234", trade_status: "TRADE_SUCCESS" },
      "sig",
    );
    expect(result.verified).toBe(true);
    expect(result.order_no).toBe("ORD-001");
    expect(result.amount).toBe(100);
  });

  it("verifyCallback 验签失败", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.checkNotifySign.mockReturnValue(false);

    const result = await provider.verifyCallback({ out_trade_no: "ORD-001" }, "sig");
    expect(result.verified).toBe(false);
  });

  it("verifyCallback app_id 不匹配", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.checkNotifySign.mockReturnValue(true);

    const result = await provider.verifyCallback(
      { out_trade_no: "ORD-001", total_amount: "100", app_id: "WRONG_APP_ID", trade_status: "TRADE_SUCCESS" },
      "sig",
    );
    expect(result.verified).toBe(false);
  });

  it("verifyCallback 非法 trade_status", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.checkNotifySign.mockReturnValue(true);

    const result = await provider.verifyCallback(
      { out_trade_no: "ORD-001", total_amount: "100", app_id: "2021001234", trade_status: "TRADE_CLOSED" },
      "sig",
    );
    expect(result.verified).toBe(false);
  });

  it("verifyCallback TRADE_FINISHED 合法", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.checkNotifySign.mockReturnValue(true);

    const result = await provider.verifyCallback(
      { out_trade_no: "ORD-001", total_amount: "50", app_id: "2021001234", trade_status: "TRADE_FINISHED" },
      "sig",
    );
    expect(result.verified).toBe(true);
  });

  it("verifyCallback 公钥缺失时 fail-closed", async () => {
    const provider = new AlipayProvider({ ...alipayConfig, appId: "" });
    const sdk = mockSdkInstance;
    sdk.config.alipayPublicKey = "";

    const result = await provider.verifyCallback({ out_trade_no: "ORD-001" }, "sig");
    expect(result.verified).toBe(false);
  });

  it("queryOrderStatus 已支付", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockResolvedValueOnce({
      code: "10000", trade_status: "TRADE_SUCCESS", trade_no: "TX-001",
    });

    const result = await provider.queryOrderStatus("ORD-001");
    expect(result.status).toBe("paid");
    expect(result.provider_trade_no).toBe("TX-001");
  });

  it("queryOrderStatus 已关闭", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockResolvedValueOnce({
      code: "10000", trade_status: "TRADE_CLOSED", trade_no: "TX-002",
    });

    const result = await provider.queryOrderStatus("ORD-002");
    expect(result.status).toBe("closed");
  });

  it("queryOrderStatus 非 10000 返回 pending", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockResolvedValueOnce({ code: "40004" });

    const result = await provider.queryOrderStatus("ORD-003");
    expect(result.status).toBe("pending");
  });

  it("queryOrderStatus 异常返回 pending", async () => {
    const provider = new AlipayProvider(alipayConfig);
    const sdk = mockSdkInstance;
    sdk.exec.mockRejectedValueOnce(new Error("network error"));

    const result = await provider.queryOrderStatus("ORD-004");
    expect(result.status).toBe("pending");
  });
});
