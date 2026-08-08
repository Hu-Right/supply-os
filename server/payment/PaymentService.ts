import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  CreateOrderRequest,
  OrderInfo,
  OrderStatusResult,
  PaymentProviderName,
} from "../../src/types/payment";
import type { PaymentStrategy } from "./types";
import { MockProvider } from "./MockProvider";
import { AlipayProvider } from "./AlipayProvider";
import { WechatProvider } from "./WechatProvider";

export class PaymentService {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) throw new Error(`Unsupported payment provider: ${provider}`);
    return strategy;
  }

  async createOrder(dbPool: any, request: CreateOrderRequest): Promise<OrderInfo> {
    const userKey = String(request.user_key || "").trim().toLowerCase().slice(0, 190);
    const planCode = String(request.plan_code || "").trim();
    const provider = request.provider;
    const noticeId = request.notice_id ? Number(request.notice_id) : null;

    if (!userKey || !planCode) throw new Error("USER_AND_PLAN_REQUIRED");

    const [planRows] = await dbPool.query(
      `SELECT plan_code, name, price, currency, unlock_quota, duration_days, plan_type
       FROM crm_membership_plans
       WHERE plan_code = ? AND is_active = 1
       LIMIT 1`,
      [planCode],
    );
    const plan = (planRows as RowDataPacket[])[0];
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    if (plan.plan_type === "single" && !noticeId) throw new Error("NOTICE_ID_REQUIRED");

    const amount = Number(plan.price);
    if (amount <= 0) throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");

    const [existingRows] = await dbPool.query(
      `SELECT order_no
       FROM crm_payment_orders
       WHERE user_key = ?
         AND plan_code = ?
         AND provider = ?
         AND status = 'pending'
         AND (notice_id <=> ?)
       ORDER BY id DESC
       LIMIT 1`,
      [userKey, planCode, provider, noticeId],
    );
    const existingOrder = (existingRows as RowDataPacket[])[0];

    const strategy = this.getStrategy(provider);
    const orderNo = existingOrder?.order_no || this.makeOrderNo();
    const returnUrl = this.appendUrlParams(request.return_url || "", {
      order_no: orderNo,
      notice_id: noticeId || "",
    });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo,
      amount,
      String(plan.name || planCode),
      returnUrl,
      request.client_ip,
    );

    if (existingOrder) {
      await dbPool.execute(
        `UPDATE crm_payment_orders
         SET amount = ?, currency = ?, pay_url = ?, qr_code_url = ?, raw_request = ?, updated_at = NOW()
         WHERE order_no = ? AND status = 'pending'`,
        [
          amount,
          plan.currency || "CNY",
          pay_url,
          qr_code_url || null,
          JSON.stringify({ ...request, user_key: userKey, notice_id: noticeId }),
          orderNo,
        ],
      );
    } else {
      await dbPool.execute(
        `INSERT INTO crm_payment_orders
          (user_id, order_no, user_key, provider, plan_code, notice_id, amount, currency, status, pay_url, qr_code_url, raw_request, created_at)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())`,
        [
          userKey,
          orderNo,
          userKey,
          provider,
          planCode,
          noticeId,
          amount,
          plan.currency || "CNY",
          pay_url,
          qr_code_url || null,
          JSON.stringify({ ...request, user_key: userKey, notice_id: noticeId }),
        ],
      );
    }

    return {
      order_no: orderNo,
      provider,
      amount,
      currency: plan.currency || "CNY",
      pay_url,
      qr_code_url,
      status: "pending",
      notice_id: noticeId,
      created_at: new Date().toISOString(),
    };
  }

  async queryOrder(dbPool: any, orderNo: string, providerTradeNo?: string): Promise<OrderStatusResult> {
    const [rows] = await dbPool.query(
      "SELECT order_no, provider, plan_code, amount, currency, status, notice_id, provider_trade_no, paid_at FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const dbOrder = (rows as RowDataPacket[])[0];
    if (!dbOrder) return { order_no: orderNo, status: "closed" };

    if (dbOrder.status === "pending" && dbOrder.provider) {
      try {
        const strategy = this.getStrategy(dbOrder.provider as PaymentProviderName);
        const result = await strategy.queryOrderStatus(orderNo, providerTradeNo);
        if (result.status === "paid") {
          await this.activatePaidOrder(dbPool, orderNo, result.provider_trade_no);
          return {
            ...result,
            order_no: orderNo,
            provider: dbOrder.provider,
            plan_code: dbOrder.plan_code,
            amount: Number(dbOrder.amount || 0),
            currency: dbOrder.currency || "CNY",
            notice_id: dbOrder.notice_id || null,
          };
        }
        if (result.status !== "pending") {
          return {
            ...result,
            order_no: orderNo,
            provider: dbOrder.provider,
            plan_code: dbOrder.plan_code,
            amount: Number(dbOrder.amount || 0),
            currency: dbOrder.currency || "CNY",
            notice_id: dbOrder.notice_id || null,
          };
        }
      } catch {
        // Keep the database status when provider polling is unavailable.
      }
    }

    return {
      order_no: dbOrder.order_no,
      status: dbOrder.status,
      notice_id: dbOrder.notice_id || null,
      provider: dbOrder.provider,
      plan_code: dbOrder.plan_code,
      amount: Number(dbOrder.amount || 0),
      currency: dbOrder.currency || "CNY",
      provider_trade_no: dbOrder.provider_trade_no || undefined,
      paid_at: dbOrder.paid_at || undefined,
    };
  }

  async handleNotify(
    dbPool: any,
    provider: PaymentProviderName,
    rawBody: any,
    signature: string,
  ): Promise<{ success: boolean; order_no: string; message?: string }> {
    const strategy = this.getStrategy(provider);
    const verifyResult = await strategy.verifyCallback(rawBody, signature);
    if (!verifyResult.verified) {
      return { success: false, order_no: verifyResult.order_no, message: "SIGN_VERIFY_FAILED" };
    }
    if (!verifyResult.order_no) {
      return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
    }

    // BUG-PAY-1 修复：校验回调金额与订单金额一致，防止金额篡改
    if (verifyResult.amount > 0) {
      const [orderRows] = await dbPool.query(
        "SELECT amount, status FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [verifyResult.order_no],
      );
      const dbOrder = (orderRows as RowDataPacket[])[0];
      if (dbOrder) {
        const orderAmount = Number(dbOrder.amount || 0);
        const callbackAmount = Number(verifyResult.amount || 0);
        // 允许 0.01 精度误差（分→元转换可能产生浮点偏差）
        if (orderAmount > 0 && Math.abs(orderAmount - callbackAmount) > 0.01) {
          console.warn(
            `[PaymentService] 金额不匹配: order=${orderAmount}, callback=${callbackAmount}, order_no=${verifyResult.order_no}`,
          );
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
      }
    }

    await this.activatePaidOrder(dbPool, verifyResult.order_no, verifyResult.provider_trade_no);
    return { success: true, order_no: verifyResult.order_no };
  }

  private async activatePaidOrder(dbPool: any, orderNo: string, providerTradeNo?: string): Promise<void> {
    // BUG-P1 修复：使用事务保证 UPDATE + INSERT 原子性，防止并发重复发放权益
    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      // 悲观锁：SELECT ... FOR UPDATE 防止并发激活同一订单
      const [orderRows] = await conn.query(
        "SELECT user_key, plan_code, notice_id, amount, status FROM crm_payment_orders WHERE order_no = ? LIMIT 1 FOR UPDATE",
        [orderNo],
      );
      const order = (orderRows as RowDataPacket[])[0];
      if (!order) { await conn.commit(); return; }

      // 幂等保护：已支付的订单直接跳过
      if (order.status === "paid") { await conn.commit(); return; }

      await conn.execute(
        `UPDATE crm_payment_orders
         SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
         WHERE order_no = ?`,
        [providerTradeNo || null, orderNo],
      );

      const [planRows] = await conn.query(
        "SELECT plan_code, unlock_quota, duration_days, plan_type FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
        [order.plan_code],
      );
      const plan = (planRows as RowDataPacket[])[0];
      if (!plan) { await conn.commit(); return; }

      if (plan.plan_type === "single") {
        if (order.notice_id) await this.grantSingleNoticeUnlock(conn, order);
        await conn.commit();
        return;
      }

      const [existingEntitlements] = await conn.query(
        "SELECT id FROM crm_user_entitlements WHERE source_order_no = ? LIMIT 1",
        [orderNo],
      );
      if ((existingEntitlements as RowDataPacket[]).length > 0) { await conn.commit(); return; }

      if (plan.plan_type !== "single") {
        await conn.execute(
          `INSERT INTO crm_user_subscriptions
            (user_id, user_key, plan_code, status, started_at${plan.duration_days ? ", expires_at" : ""})
           VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""})`,
          plan.duration_days
            ? [order.user_key, order.user_key, order.plan_code, plan.duration_days]
            : [order.user_key, order.user_key, order.plan_code],
        );
      }

      await conn.execute(
        `INSERT INTO crm_user_entitlements
          (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at${plan.duration_days ? ", expires_at" : ""}, status)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW()${plan.duration_days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""}, 'active')`,
        plan.duration_days
          ? [order.user_key, order.user_key, orderNo, order.plan_code, Number(plan.unlock_quota || 1), plan.duration_days]
          : [order.user_key, order.user_key, orderNo, order.plan_code, Number(plan.unlock_quota || 1)],
      );

      await conn.execute(
        "UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?",
        [order.user_key],
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private async grantSingleNoticeUnlock(dbPool: any, order: any): Promise<void> {
    const [existingUnlockRows] = await dbPool.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
      [order.user_key, order.notice_id],
    );
    if ((existingUnlockRows as RowDataPacket[]).length > 0) return;

    const [noticeRows] = await dbPool.query(
      "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [order.notice_id],
    );
    const notice = (noticeRows as RowDataPacket[])[0];
    if (!notice) return;

    await dbPool.execute(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'single', ?, NOW(), ?)`,
      [order.user_key, order.user_key, order.notice_id, Number(order.amount || 0), JSON.stringify(this.normalizeJsonArray(notice.unspsc_codes))],
    );

    await dbPool.execute(
      `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'subscribed', 'payment')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
      [order.user_key, order.user_key, order.notice_id],
    );
  }

  private normalizeJsonArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // P0-4 修复：订单号使用 16 位随机十六进制（2^64 空间），消除可预测性和并发碰撞
  private makeOrderNo(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `SO${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }

  private appendUrlParams(url: string, params: Record<string, string | number>): string {
    if (!url) return "";
    const query = Object.entries(params)
      .filter(([, value]) => String(value) !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    if (!query) return url;

    // BUG-P4 修复：查询参数必须插入在 hash (#) 之前，而非之后
    if (url.includes("#")) {
      const hashIdx = url.indexOf("#");
      const beforeHash = url.slice(0, hashIdx);
      const hash = url.slice(hashIdx + 1);
      return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}${query}#${hash}`;
    }
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  static initDefault(paymentMode: "mock" | "live" = "mock"): PaymentService {
    const service = new PaymentService();
    service.registerStrategy("mock", new MockProvider());

    if (paymentMode === "live") {
      const alipayAppId = process.env.ALIPAY_APP_ID || "";
      if (alipayAppId) {
        service.registerStrategy(
          "alipay",
          new AlipayProvider({
            appId: alipayAppId,
            privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
            publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
            notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
            sandbox: process.env.ALIPAY_SANDBOX === "true",
          }),
        );
      }

      const wechatAppId = process.env.WECHAT_APP_ID || "";
      const wechatMchId = process.env.WECHAT_MCH_ID || process.env.WECHAT_MERCHANT_ID || "";
      if (wechatAppId && wechatMchId) {
        service.registerStrategy(
          "wechat",
          new WechatProvider({
            appId: wechatAppId,
            mchId: wechatMchId,
            apiV3Key: process.env.WECHAT_API_V3_KEY || "",
            privateKey: process.env.WECHAT_PRIVATE_KEY || "",
            notifyUrl: process.env.WECHAT_NOTIFY_URL || "",
            sandbox: false,
          }),
        );
      }
    }

    return service;
  }
}
