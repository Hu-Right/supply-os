import crypto from "crypto";
import type { PaymentStrategy, PaymentOrderStatus } from "./types";

/**
 * 支付宝 H5 支付策略
 *
 * 使用 alipay.trade.page.pay (电脑网站支付) 或 alipay.trade.wap.pay (手机网站支付)
 * 返回支付跳转 URL，用户访问后完成支付。
 *
 * 生产环境需要配置：
 *   ALIPAY_APP_ID       - 支付宝应用 ID
 *   ALIPAY_PRIVATE_KEY  - 商户私钥 (PEM)
 *   ALIPAY_PUBLIC_KEY   - 支付宝公钥 (PEM)
 *
 * 当前实现为 stub + live 骨架，待安装 alipay-sdk 后替换为完整实现。
 */
export class AlipayProvider implements PaymentStrategy {
  readonly name = "alipay" as const;

  private appId: string;
  private privateKey: string;
  private publicKey: string;
  private gateway: string;

  constructor(config: {
    appId: string;
    privateKey: string;
    publicKey: string;
    sandbox?: boolean;
  }) {
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.publicKey = config.publicKey;
    this.gateway = config.sandbox
      ? "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
      : "https://openapi.alipay.com/gateway.do";
  }

  async createPaymentUrl(
    orderNo: string,
    amount: number,
    description: string,
    returnUrl?: string,
  ): Promise<{ pay_url: string; qr_code_url?: string }> {
    const bizContent = {
      out_trade_no: orderNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: amount.toFixed(2),
      subject: description,
      body: description,
      timeout_express: "30m",
    };

    // 待安装 alipay-sdk 后，这里改为:
    // const AlipaySdk = require("alipay-sdk").default;
    // const alipay = new AlipaySdk({ ... });
    // const result = await alipay.exec("alipay.trade.page.pay", { bizContent, returnUrl });

    // 当前: 手动构造签名字段 (简化版)
    const params: Record<string, string> = {
      app_id: this.appId,
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "+0800"),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
      return_url: returnUrl || "",
    };

    const signStr = this.buildSignStr(params);
    const sign = this.rsa256Sign(signStr);
    params.sign = sign;

    const queryStr = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    return {
      pay_url: `${this.gateway}?${queryStr}`,
    };
  }

  async verifyCallback(rawBody: any, _signature: string): Promise<{
    verified: boolean;
    order_no: string;
    provider_trade_no: string;
    amount: number;
  }> {
    // 待安装 alipay-sdk 后，使用 alipay.checkNotifySign(rawBody) 验签
    // 当前 stub: 信任所有回调
    return {
      verified: true,
      order_no: rawBody?.out_trade_no || "",
      provider_trade_no: rawBody?.trade_no || "",
      amount: parseFloat(rawBody?.total_amount || "0"),
    };
  }

  async queryOrderStatus(orderNo: string): Promise<{
    status: PaymentOrderStatus;
    provider_trade_no?: string;
  }> {
    // 待安装 alipay-sdk 后，调用 alipay.trade.query
    // 当前 stub
    return { status: "pending" };
  }

  // 构建待签名字符串（支付宝 RSA2 签名规则）
  private buildSignStr(params: Record<string, string>): string {
    return Object.keys(params)
      .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "")
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
  }

  private rsa256Sign(data: string): string {
    // 待安装 alipay-sdk 后替换为 SDK 签名
    // 当前 stub: 返回占位符
    if (!this.privateKey) return "STUB_SIGN";
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(data, "utf-8");
    return sign.sign(this.privateKey, "base64");
  }
}
