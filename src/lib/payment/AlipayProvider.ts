import "server-only";
import { AlipaySdk } from "alipay-sdk";
import type { PaymentOrderStatus } from "../types/payment";
import type { PaymentStrategy } from "./types";
import { normalizePem } from "./keys";

/**
 * 支付宝 H5 支付策略（基于 alipay-sdk 官方 SDK）
 *
 * 使用 alipay.trade.page.pay (电脑网站支付) 或 alipay.trade.wap.pay (手机网站支付)
 * 返回支付跳转 URL，用户访问后完成支付。
 *
 * 生产环境需要配置：
 *   ALIPAY_APP_ID       - 支付宝应用 ID
 *   ALIPAY_PRIVATE_KEY  - 商户私钥 (PEM)
 *   ALIPAY_PUBLIC_KEY   - 支付宝公钥 (PEM)
 */
export class AlipayProvider implements PaymentStrategy {
  readonly name = "alipay" as const;

  private sdk: AlipaySdk;
  private appId: string;
  private notifyUrl: string;

  constructor(config: {
    appId: string;
    privateKey: string;
    publicKey: string;
    notifyUrl?: string;
    sandbox?: boolean;
  }) {
    this.appId = config.appId;
    this.notifyUrl = String(config.notifyUrl || "");

    const gateway = config.sandbox
      ? "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
      : "https://openapi.alipay.com/gateway.do";

    this.sdk = new AlipaySdk({
      appId: config.appId,
      privateKey: normalizePem(config.privateKey, "PRIVATE KEY"),
      alipayPublicKey: normalizePem(config.publicKey, "PUBLIC KEY"),
      gateway,
      signType: "RSA2",
      keyType: "PKCS8",
      camelcase: false, // 保持支付宝原始 snake_case 字段名
    });
  }

  async createPaymentUrl(
    orderNo: string,
    amount: number,
    description: string,
    returnUrl?: string,
    _clientIp?: string,
  ): Promise<{ pay_url: string; qr_code_url?: string }> {
    // alipay-sdk v4 的 sign() 对值为 undefined 的参数会抛 TypeError（util.ts 对每个值调
    // Array.prototype.toString.call）：无值的 return_url/notify_url 必须整体省略而非传 undefined
    const options: { bizContent: Record<string, string>; return_url?: string; notify_url?: string } = {
      bizContent: {
        out_trade_no: orderNo,
        product_code: "FAST_INSTANT_TRADE_PAY",
        total_amount: amount.toFixed(2),
        subject: description,
        body: description,
        timeout_express: "30m",
      },
    };
    if (returnUrl) options.return_url = returnUrl;
    if (this.notifyUrl) options.notify_url = this.notifyUrl;

    const payUrl = this.sdk.pageExecute("alipay.trade.page.pay", options);

    // 使用当面付（precreate）生成原生二维码，扫码后直接进入支付宝支付页面
    // 如果商户未开通当面付或调用失败，直接抛出错误，不回退
    const precreateOptions: { bizContent: Record<string, string>; notify_url?: string } = {
      bizContent: {
        out_trade_no: orderNo,
        total_amount: amount.toFixed(2),
        subject: description,
      },
    };
    if (this.notifyUrl) precreateOptions.notify_url = this.notifyUrl;

    console.log("[AlipayProvider] 调用 precreate 生成原生二维码...");
    const precreateResult = await this.sdk.exec("alipay.trade.precreate", precreateOptions);
    
    if (precreateResult.code !== "10000" || !precreateResult.qr_code) {
      const errorMsg = precreateResult.sub_msg || precreateResult.msg || "未知错误";
      console.error("[AlipayProvider] ✗ precreate 失败:", precreateResult.code, errorMsg);
      throw new Error(`支付宝二维码生成失败: ${errorMsg} (code: ${precreateResult.code})`);
    }
    
    const qrCodeUrl = precreateResult.qr_code;
    console.log("[AlipayProvider] ✓ precreate 成功，生成原生支付宝二维码:", qrCodeUrl.substring(0, 50) + "...");

    return { pay_url: payUrl, qr_code_url: qrCodeUrl };
  }

  /**
   * 验证支付宝异步通知签名
   * @param rawBody - 回调请求体（含 sign/sign_type 等字段）
   * @param _signature - 保留参数（实际验签由 SDK checkNotifySign 从 rawBody 内提取 sign 字段完成）
   */
  async verifyCallback(rawBody: any, _signature: string): Promise<{
    verified: boolean;
    order_no: string;
    provider_trade_no: string;
    amount: number;
  }> {
    const order_no = rawBody?.out_trade_no || "";
    const provider_trade_no = rawBody?.trade_no || "";
    const amount = parseFloat(rawBody?.total_amount || "0");

    // P0-2 安全修复：公钥缺失时 fail-closed，拒绝验签（防止伪造回调免费履约）
    if (!this.sdk.config.alipayPublicKey || !this.appId) {
      console.error("[AlipayProvider] 公钥或 APP_ID 未配置，拒绝验签（fail-closed）");
      return { verified: false, order_no, provider_trade_no, amount };
    }

    try {
      // 使用 SDK 内置的回调验签（RSA-SHA256）
      const verified = this.sdk.checkNotifySign(rawBody);

      if (!verified) {
        console.warn(`[AlipayProvider] 签名验证失败: order_no=${order_no}`);
        return { verified: false, order_no, provider_trade_no, amount };
      }

      // 校验 app_id 是否与本应用一致（防止伪造通知）
      const callbackAppId = String(rawBody?.app_id || "");
      if (callbackAppId && callbackAppId !== this.appId) {
        console.warn(`[AlipayProvider] app_id 不匹配: 期望 ${this.appId}, 实际 ${callbackAppId}`);
        return { verified: false, order_no, provider_trade_no, amount };
      }

      // P0-2 安全修复：校验 trade_status，仅接受 TRADE_SUCCESS / TRADE_FINISHED
      // TRADE_CLOSED（退款/关闭）不应触发履约；
      // 白名单强制匹配：缺失/空串同样拒绝（原实现的空值穿透是防御缺口）
      const tradeStatus = String(rawBody?.trade_status || "");
      if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
        console.warn(`[AlipayProvider] 非法 trade_status=${tradeStatus || "(空)"}: order_no=${order_no}`);
        return { verified: false, order_no, provider_trade_no, amount };
      }

      return { verified: true, order_no, provider_trade_no, amount };
    } catch (err) {
      console.error("[AlipayProvider] verifyCallback 异常:", (err as Error).message);
      return { verified: false, order_no, provider_trade_no, amount };
    }
  }

  async queryOrderStatus(orderNo: string, providerTradeNo?: string): Promise<{
    status: PaymentOrderStatus;
    provider_trade_no?: string;
  }> {
    try {
      const result = await this.sdk.exec("alipay.trade.query", {
        bizContent: {
          out_trade_no: orderNo,
          ...(providerTradeNo ? { trade_no: providerTradeNo } : {}),
        },
      });

      if (result.code !== "10000") return { status: "pending" };

      const tradeStatus = String(result.trade_status || "");
      const tradeNo = result.trade_no || providerTradeNo;

      if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
        return { status: "paid", provider_trade_no: tradeNo };
      }
      if (tradeStatus === "TRADE_CLOSED") {
        return { status: "closed", provider_trade_no: tradeNo };
      }
      return { status: "pending", provider_trade_no: tradeNo };
    } catch (err) {
      console.error("[AlipayProvider] queryOrderStatus 异常:", (err as Error).message);
      return { status: "pending" };
    }
  }
}
