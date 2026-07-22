import crypto from "crypto";
import type { PaymentStrategy, PaymentOrderStatus } from "@/types/payment";

/**
 * 微信支付 H5 策略
 *
 * 使用微信支付 V3 API 的 H5 支付 (h5pay) 或 Native 支付
 * - H5 支付：微信外浏览器打开，唤起微信 App 完成支付
 * - Native 支付：PC 端展示二维码，用户扫码支付
 *
 * 生产环境需要配置：
 *   WECHAT_APP_ID        - 微信商户 AppID
 *   WECHAT_MERCHANT_ID   - 微信商户号 mchid
 *   WECHAT_API_V3_KEY    - API v3 密钥
 *   WECHAT_PRIVATE_KEY   - 商户 API 私钥 (PEM)
 *
 * 当前实现为 stub + live 骨架，待安装 wechatpay-node-v3 后替换为完整实现。
 */
export class WechatProvider implements PaymentStrategy {
  readonly name = "wechat" as const;

  private appId: string;
  private mchId: string;
  private apiV3Key: string;
  private privateKey: string;
  private notifyUrl: string;
  private baseUrl: string;

  constructor(config: {
    appId: string;
    mchId: string;
    apiV3Key: string;
    privateKey: string;
    notifyUrl: string;
    sandbox?: boolean;
  }) {
    this.appId = config.appId;
    this.mchId = config.mchId;
    this.apiV3Key = config.apiV3Key;
    this.privateKey = config.privateKey;
    this.notifyUrl = config.notifyUrl;
    this.baseUrl = "https://api.mch.weixin.qq.com";
  }

  async createPaymentUrl(
    orderNo: string,
    amount: number,
    description: string,
    returnUrl?: string,
  ): Promise<{ pay_url: string; qr_code_url?: string }> {
    const total = Math.round(amount * 100); // 微信金额单位：分

    const body = {
      appid: this.appId,
      mchid: this.mchId,
      description: description.slice(0, 127),
      out_trade_no: orderNo,
      notify_url: this.notifyUrl,
      amount: {
        total,
        currency: "CNY",
      },
      scene_info: {
        payer_client_ip: "0.0.0.0", // 生产环境应从 req.ip 获取
        h5_info: {
          type: "Wap", // 或 iOS / Android
        },
      },
    };

    // 待安装 wechatpay-node-v3 后改为 SDK 调用:
    // const WxPay = require("wechatpay-node-v3");
    // const wxpay = new WxPay({ appid, mchid, ... });
    // const result = await wxpay.transactions_h5(body);
    // return { pay_url: result.h5_url };

    // 当前 stub: 构造一个假的 H5 URL
    const nonceStr = crypto.randomBytes(16).toString("hex");
    const h5Url = `https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?${[
      `prepay_id=STUB_${orderNo}`,
      `package=WAP`,
      `noncestr=${nonceStr}`,
      `redirect_url=${encodeURIComponent(returnUrl || "")}`,
    ].join("&")}`;

    return {
      pay_url: h5Url,

      // 同时生成 Native 支付二维码链接作为 PC 降级方案
      qr_code_url: `weixin://wxpay/bizpayurl?pr=${orderNo}`,
    };
  }

  async verifyCallback(rawBody: any, signature: string): Promise<{
    verified: boolean;
    order_no: string;
    provider_trade_no: string;
    amount: number;
  }> {
    // 待安装 wechatpay-node-v3 后:
    // 1. 从 HTTP 头获取 Wechatpay-Signature / Wechatpay-Nonce / Wechatpay-Timestamp
    // 2. 构建签名字符串: "timestamp\nnonce\nbody\n"
    // 3. 使用微信平台公钥验签

    // 当前 stub
    return {
      verified: true,
      order_no: rawBody?.out_trade_no || "",
      provider_trade_no: rawBody?.transaction_id || "",
      amount: (rawBody?.amount?.total || 0) / 100,
    };
  }

  async queryOrderStatus(orderNo: string): Promise<{
    status: PaymentOrderStatus;
    provider_trade_no?: string;
  }> {
    // 待安装 wechatpay-node-v3 后:
    // const result = await wxpay.query({ out_trade_no: orderNo, mchid });
    // 根据 trade_state 返回状态

    // 当前 stub
    return { status: "pending" };
  }
}
