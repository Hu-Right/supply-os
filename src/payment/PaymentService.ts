import type {
  PaymentStrategy,
  PaymentProviderName,
  PaymentOrderStatus,
  CreateOrderRequest,
  CreateOrderResult,
  OrderStatusResult,
} from "@/types/payment";
import { MockProvider } from "./MockProvider";
import { AlipayProvider } from "./AlipayProvider";
import { WechatProvider } from "./WechatProvider";

/**
 * 支付服务编排层
 * - 根据 provider 参数选择对应的支付策略
 * - 负责与数据库交互（创建订单、更新状态、分配权益）
 */
export class PaymentService {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  /**
   * 注册支付策略
   */
  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
  }

  /**
   * 获取指定支付策略
   */
  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }
    return strategy;
  }

  /**
   * 创建支付订单（在 server.ts 的 API handler 中调用）
   *
   * @param dbPool - MySQL 连接池
   * @param request - 下单参数
   * @returns 订单详情（含 pay_url）
   */
  async createOrder(
    dbPool: any,
    request: CreateOrderRequest,
  ): Promise<CreateOrderResult> {
    const { user_key, plan_code, provider, return_url } = request;

    // 1. 查询套餐价格
    const [planRows] = await dbPool.query(
      "SELECT plan_code, name, price, currency, unlock_quota FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
      [plan_code],
    );
    const plan = (planRows as any[])[0];
    if (!plan) throw new Error("套餐不存在");

    const amount = Number(plan.price);
    if (amount <= 0) throw new Error("免费套餐无需支付");

    // 2. 生成唯一订单号
    const now = new Date();
    const orderNo = `SO${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(Math.floor(Math.random() * 9000 + 1000))}`;

    // 3. 检查是否已有这个用户+套餐的待支付订单（防止重复）
    const [existingRows] = await dbPool.query(
      "SELECT order_no FROM crm_payment_orders WHERE user_key = ? AND plan_code = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [user_key, plan_code],
    );
    const existingOrder = (existingRows as any[])[0];

    if (existingOrder) {
      // 复用已有订单（不创建新的），重新获取支付链接
      const strategy = this.getStrategy(provider);
      const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
        existingOrder.order_no,
        amount,
        `${plan.name}`,
        return_url,
      );
      await dbPool.execute(
        `UPDATE crm_payment_orders
         SET provider = ?, amount = ?, currency = ?, pay_url = ?, qr_code_url = ?, updated_at = NOW()
         WHERE order_no = ? AND status = 'pending'`,
        [provider, amount, plan.currency || "CNY", pay_url, qr_code_url || null, existingOrder.order_no],
      );

      return {
        order_no: existingOrder.order_no,
        provider,
        amount,
        currency: plan.currency || "CNY",
        pay_url,
        qr_code_url,
        status: "pending",
        created_at: new Date().toISOString(),
      };
    }

    // 4. 调用支付策略创建支付链接
    const strategy = this.getStrategy(provider);
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo,
      amount,
      `${plan.name}`,
      return_url,
    );

    // 5. 写入数据库
    await dbPool.execute(
      `INSERT INTO crm_payment_orders
        (user_id, order_no, user_key, provider, plan_code, amount, currency, status, pay_url, qr_code_url, created_at)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, 'CNY', 'pending', ?, ?, NOW())`,
      [user_key, orderNo, user_key, provider, plan_code, amount, pay_url, qr_code_url || null],
    );

    return {
      order_no: orderNo,
      provider,
      amount,
      currency: plan.currency || "CNY",
      pay_url,
      qr_code_url,
      status: "pending",
      created_at: new Date().toISOString(),
    };
  }

  private async activatePaidOrder(
    dbPool: any,
    orderNo: string,
    providerTradeNo?: string,
  ): Promise<void> {
    await dbPool.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
       WHERE order_no = ?`,
      [providerTradeNo || null, orderNo],
    );

    const [orderRows] = await dbPool.query(
      "SELECT user_key, plan_code FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const order = (orderRows as any[])[0];
    if (!order) return;

    const [existingEntitlements] = await dbPool.query(
      "SELECT id FROM crm_user_entitlements WHERE source_order_no = ? LIMIT 1",
      [orderNo],
    );
    if ((existingEntitlements as any[]).length > 0) return;

    const [planRows] = await dbPool.query(
      "SELECT plan_code, unlock_quota, duration_days, plan_type FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
      [order.plan_code],
    );
    const plan = (planRows as any[])[0];
    if (!plan) return;

    if (plan.plan_type !== "single") {
      await dbPool.execute(
        `INSERT INTO crm_user_subscriptions
          (user_id, user_key, plan_code, status, started_at${plan.duration_days ? ", expires_at" : ""})
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""})`,
        plan.duration_days
          ? [order.user_key, order.user_key, order.plan_code, plan.duration_days]
          : [order.user_key, order.user_key, order.plan_code],
      );
    }

    await dbPool.execute(
      `INSERT INTO crm_user_entitlements
        (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at${plan.duration_days ? ", expires_at" : ""}, status)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""}, 'active')`,
      plan.duration_days
        ? [order.user_key, order.user_key, orderNo, order.plan_code, Number(plan.unlock_quota || 1), plan.duration_days]
        : [order.user_key, order.user_key, orderNo, order.plan_code, Number(plan.unlock_quota || 1)],
    );

    await dbPool.execute(
      "UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?",
      [order.user_key],
    );
  }

  /**
   * 查询订单状态
   */
  async queryOrder(
    dbPool: any,
    orderNo: string,
  ): Promise<OrderStatusResult> {
    // 先查数据库
    const [rows] = await dbPool.query(
      "SELECT order_no, status, provider_trade_no, paid_at FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const dbOrder = (rows as any[])[0];
    if (!dbOrder) {
      return { order_no: orderNo, status: "closed" };
    }

    // 如果数据库里还是 pending，尝试向支付平台查询
    if (dbOrder.status === "pending") {
      const [orderRows] = await dbPool.query(
        "SELECT provider FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [orderNo],
      );
      const provider = (orderRows as any[])[0]?.provider as PaymentProviderName;
      if (provider) {
        try {
          const strategy = this.getStrategy(provider);
          const result = await strategy.queryOrderStatus(orderNo);
          if (result.status !== "pending") {
            if (result.status === "paid") {
              await this.activatePaidOrder(dbPool, orderNo, result.provider_trade_no);
            }
            return result as OrderStatusResult;
          }
        } catch {
          // 忽略查询失败，返回数据库状态
        }
      }
    }

    return {
      order_no: dbOrder.order_no,
      status: dbOrder.status,
      provider_trade_no: dbOrder.provider_trade_no || undefined,
      paid_at: dbOrder.paid_at || undefined,
    };
  }

  /**
   * 处理支付异步通知（支付宝/微信回调）
   *
   * @param dbPool - MySQL 连接池
   * @param provider - 支付渠道
   * @param rawBody - 原始回调数据
   * @param signature - 签名（微信需从 header 提取）
   * @returns 验证结果
   */
  async handleNotify(
    dbPool: any,
    provider: PaymentProviderName,
    rawBody: any,
    signature: string,
  ): Promise<{ success: boolean; order_no: string; message?: string }> {
    const strategy = this.getStrategy(provider);

    // 1. 验签
    const verifyResult = await strategy.verifyCallback(rawBody, signature);
    if (!verifyResult.verified) {
      return { success: false, order_no: verifyResult.order_no, message: "签名验证失败" };
    }

    const { order_no, provider_trade_no, amount } = verifyResult;
    if (!order_no) {
      return { success: false, order_no: "", message: "订单号不存在" };
    }

    // 2. 更新订单状态
    await dbPool.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = ?, paid_at = NOW(), updated_at = NOW()
       WHERE order_no = ? AND status = 'pending'`,
      [provider_trade_no, order_no],
    );

    // 3. 查询订单关联的套餐信息
    const [orderRows] = await dbPool.query(
      "SELECT user_key, plan_code FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
      [order_no],
    );
    const order = (orderRows as any[])[0];
    if (!order) {
      return { success: false, order_no, message: "订单不存在" };
    }

    // 4. 查询套餐详情
    const [planRows] = await dbPool.query(
      "SELECT plan_code, unlock_quota, duration_days FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
      [order.plan_code],
    );
    const plan = (planRows as any[])[0];
    if (!plan) {
      return { success: false, order_no, message: "套餐不存在" };
    }

    // 5. 创建订阅记录
    await dbPool.execute(
      `INSERT INTO crm_user_subscriptions
        (user_id, user_key, plan_code, status, started_at${plan.duration_days ? ", expires_at" : ""})
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""})`,
      plan.duration_days
        ? [order.user_key, order.user_key, order.plan_code, plan.duration_days]
        : [order.user_key, order.user_key, order.plan_code],
    );

    // 6. 创建权益记录
    await dbPool.execute(
      `INSERT INTO crm_user_entitlements
        (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at${plan.duration_days ? ", expires_at" : ""}, status)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""}, 'active')`,
      plan.duration_days
        ? [order.user_key, order.user_key, order_no, order.plan_code, plan.unlock_quota, plan.duration_days]
        : [order.user_key, order.user_key, order_no, order.plan_code, plan.unlock_quota],
    );

    // 7. 更新用户会员等级
    await dbPool.execute(
      "UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?",
      [order.user_key],
    );

    return { success: true, order_no };
  }

  /**
   * 初始化默认策略（server.ts 启动时调用）
   * 默认使用 Mock 模式，生产环境通过配置切换到支付宝/微信
   */
  static initDefault(paymentMode: "mock" | "live" = "mock"): PaymentService {
    const service = new PaymentService();

    // Mock 策略始终注册（开发和演示用）
    service.registerStrategy("mock", new MockProvider());

    if (paymentMode === "live") {
      // 真实支付场景需要从数据库/环境变量读取配置
      const alipayAppId = process.env.ALIPAY_APP_ID || "";
      const alipayPrivateKey = process.env.ALIPAY_PRIVATE_KEY || "";
      const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY || "";
      const alipayNotifyUrl = process.env.ALIPAY_NOTIFY_URL || "";

      if (alipayAppId) {
        service.registerStrategy(
          "alipay",
          new AlipayProvider({
            appId: alipayAppId,
            privateKey: alipayPrivateKey,
            publicKey: alipayPublicKey,
            notifyUrl: alipayNotifyUrl,
            sandbox: process.env.ALIPAY_SANDBOX === "true",
          }),
        );
      }

      const wechatAppId = process.env.WECHAT_APP_ID || "";
      const wechatMchId = process.env.WECHAT_MCH_ID || process.env.WECHAT_MERCHANT_ID || "";
      const wechatApiV3Key = process.env.WECHAT_API_V3_KEY || "";
      const wechatPrivateKey = process.env.WECHAT_PRIVATE_KEY || "";
      const wechatNotifyUrl = process.env.WECHAT_NOTIFY_URL || "";

      if (wechatAppId && wechatMchId) {
        service.registerStrategy(
          "wechat",
          new WechatProvider({
            appId: wechatAppId,
            mchId: wechatMchId,
            apiV3Key: wechatApiV3Key,
            privateKey: wechatPrivateKey,
            notifyUrl: wechatNotifyUrl,
            sandbox: false,
          }),
        );
      }
    }

    return service;
  }
}
