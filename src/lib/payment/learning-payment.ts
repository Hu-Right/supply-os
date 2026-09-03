/**
 * 学习资料支付服务
 * Learning Payment Service
 *
 * @module lib/payment/learning-payment
 * @description ARCH-B+（2026-09-01）：学习资料 / 打包套餐的订单创建、查询、履约与退款。
 *              从 PaymentService + activate.ts + mock.ts + reverse.ts 的学习分支提取为独立服务。
 *
 *              职责边界：
 *              - 订单存于 learning_orders 表（独立物理表）
 *              - 履约写入 crm_learning_material_purchases（权益表，不变）
 *              - 定价从 LearningMaterialsRepo（单资料）或 learning-bundles.ts（套餐）获取
 *              - 支付渠道策略（Alipay/Wechat/Mock）由外部注入，复用统一通道
 */
import "server-only";
import crypto from "crypto";
import type { PaymentStrategy } from "./types";
import type { PaymentProviderName } from "../types/payment";
import type { LearningOrdersRepo } from "../repos/learning-orders.repo";
import { LearningMaterialsRepo } from "../repos/learning-materials.repo";
import { findLearningBundle } from "../data/learning-bundles";
import { getPool } from "../db/pool";

export class LearningPaymentService {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  constructor(
    private learningOrdersRepo: LearningOrdersRepo,
    private learningMaterialsRepo: LearningMaterialsRepo,
  ) {}

  /** 注入支付渠道策略（由 Orchestrator 统一分发） */
  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    const s = this.strategies.get(provider);
    if (!s) throw new Error(`Unsupported payment provider: ${provider}`);
    return s;
  }

  // ── 创建订单 ──────────────────────────────────────────────────────────────

  async createOrder(params: {
    userId: number;
    userKey: string;
    planCode: string;
    provider: PaymentProviderName;
    returnUrl?: string;
    clientIp?: string;
  }): Promise<{
    order_no: string;
    provider: PaymentProviderName;
    amount: number;
    currency: string;
    pay_url: string;
    qr_code_url: string | undefined;
    status: "pending";
    created_at: string;
  }> {
    const { userId, userKey, planCode, provider } = params;

    // ── 服务端权威定价（审查 F2）──
    let amount: number;
    let planName = planCode;

    if (planCode.startsWith("material_")) {
      const materialId = planCode.slice("material_".length);
      const material = await this.learningMaterialsRepo.findByMaterialId(materialId);
      if (!material) throw new Error("MATERIAL_NOT_FOUND");
      amount = Number(material.price);
      planName = material.title_zh || material.title_en || planCode;
    } else if (planCode.startsWith("bundle_")) {
      const bundle = findLearningBundle(planCode.slice("bundle_".length));
      if (!bundle) throw new Error("BUNDLE_NOT_FOUND");
      amount = bundle.price;
      planName = bundle.labelZh;
    } else {
      throw new Error("INVALID_LEARNING_PLAN_CODE");
    }

    if (amount <= 0) throw new Error("INVALID_AMOUNT");

    const orderNo = this.makeOrderNo();
    const strategy = this.getStrategy(provider);
    const returnUrl = this.appendUrlParams(params.returnUrl || "", { order_no: orderNo });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo, amount, planName, returnUrl, params.clientIp,
    );

    const rawRequest = JSON.stringify({
      user_key: userKey, plan_code: planCode, amount,
    });

    await this.learningOrdersRepo.createOrder({
      userId, userKey, orderNo, provider, planCode, amount,
      currency: "CNY", payUrl: pay_url, qrCodeUrl: qr_code_url || null, rawRequest,
    });

    return {
      order_no: orderNo, provider, amount, currency: "CNY",
      pay_url, qr_code_url, status: "pending",
      created_at: new Date().toISOString(),
    };
  }

  // ── 查询订单 ──────────────────────────────────────────────────────────────

  async queryOrder(orderNo: string, providerTradeNo?: string): Promise<{
    order_no: string;
    status: string;
    provider: PaymentProviderName;
    plan_code: string;
    amount: number;
    currency: string;
    provider_trade_no?: string;
    paid_at?: string;
  } | null> {
    const dbOrder = await this.learningOrdersRepo.findByOrderNo(orderNo);
    if (!dbOrder) return null;

    // pending 时主动向网关轮询
    if (dbOrder.status === "pending" && dbOrder.provider) {
      try {
        const strategy = this.getStrategy(dbOrder.provider as PaymentProviderName);
        const result = await strategy.queryOrderStatus(orderNo, providerTradeNo);
        if (result.status === "paid") {
          await this.fulfillOrder(orderNo, result.provider_trade_no);
          return {
            order_no: orderNo, status: "paid",
            provider: dbOrder.provider as PaymentProviderName,
            plan_code: dbOrder.plan_code, amount: Number(dbOrder.amount),
            currency: dbOrder.currency, paid_at: new Date().toISOString(),
          };
        }
        if (result.status !== "pending") {
          return {
            order_no: orderNo, status: result.status,
            provider: dbOrder.provider as PaymentProviderName,
            plan_code: dbOrder.plan_code, amount: Number(dbOrder.amount),
            currency: dbOrder.currency,
            provider_trade_no: result.provider_trade_no,
          };
        }
      } catch { /* 网关不可用时保持数据库状态 */ }
    }

    return {
      order_no: dbOrder.order_no, status: dbOrder.status,
      provider: dbOrder.provider as PaymentProviderName,
      plan_code: dbOrder.plan_code, amount: Number(dbOrder.amount),
      currency: dbOrder.currency,
      provider_trade_no: dbOrder.provider_trade_no || undefined,
      paid_at: dbOrder.paid_at ? new Date(dbOrder.paid_at).toISOString() : undefined,
    };
  }

  // ── 真实支付回调履约 ──────────────────────────────────────────────────────

  /**
   * 激活已支付的学习订单（事务封装：悲观锁 + 幂等 + 购买记录写入）
   */
  async fulfillOrder(orderNo: string, providerTradeNo?: string): Promise<void> {
    const conn = await this.learningOrdersRepo.getConnection();
    try {
      await conn.beginTransaction();

      const order = await this.learningOrdersRepo.findOrderForUpdate(conn, orderNo);
      if (!order) { await conn.commit(); return; }

      // 状态机白名单：仅 pending 可履约
      if (order.status !== "pending") { await conn.commit(); return; }

      await this.learningOrdersRepo.markAsPaidInTransaction(conn, orderNo, providerTradeNo || null);

      // 单资料购买
      if (order.plan_code.startsWith("material_")) {
        const materialId = order.plan_code.replace(/^material_/, "");
        await this.learningMaterialsRepo.recordPurchaseInTransaction(
          conn, order.user_id!, materialId, orderNo, Number(order.amount),
        );
        await conn.commit();
        return;
      }

      // 打包套餐购买：从 learning-bundles 静态配置获取条目清单
      if (order.plan_code.startsWith("bundle_")) {
        const bundleId = order.plan_code.replace(/^bundle_/, "");
        const bundle = findLearningBundle(bundleId);
        if (bundle && bundle.includesIds.length > 0) {
          // 履约前按 DB 过滤，防止历史订单携带已下架条目
          const existingMaterials = await this.learningMaterialsRepo.findByMaterialIds(bundle.includesIds);
          const validIds = existingMaterials.map((m) => m.material_id);
          if (validIds.length > 0) {
            await this.learningMaterialsRepo.recordBundlePurchasesInTransaction(
              conn, order.user_id!, validIds, orderNo, Number(order.amount),
            );
          }
        }
        await conn.commit();
        return;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── Mock 支付履约 ────────────────────────────────────────────────────────

  async fulfillMockOrder(orderNo: string, rawNotify: string): Promise<{ found: boolean }> {
    const order = await this.learningOrdersRepo.findByOrderNo(orderNo);
    if (!order) return { found: false };
    if (order.status !== "pending") return { found: true };

    const conn = await this.learningOrdersRepo.getConnection();
    try {
      await conn.beginTransaction();
      await this.learningOrdersRepo.markAsMockPaidInTransaction(conn, orderNo, rawNotify);

      if (order.plan_code.startsWith("material_")) {
        const materialId = order.plan_code.replace(/^material_/, "");
        await this.learningMaterialsRepo.recordPurchaseInTransaction(
          conn, order.user_id!, materialId, orderNo, Number(order.amount),
        );
        await conn.commit();
        return { found: true };
      }

      if (order.plan_code.startsWith("bundle_")) {
        const bundleId = order.plan_code.replace(/^bundle_/, "");
        const bundle = findLearningBundle(bundleId);
        if (bundle && bundle.includesIds.length > 0) {
          const lmRepo = new LearningMaterialsRepo(getPool());
          const existingMaterials = await lmRepo.findByMaterialIds(bundle.includesIds);
          const validIds = existingMaterials.map((m) => m.material_id);
          if (validIds.length > 0) {
            await this.learningMaterialsRepo.recordBundlePurchasesInTransaction(
              conn, order.user_id!, validIds, orderNo, Number(order.amount),
            );
          }
        }
        await conn.commit();
        return { found: true };
      }

      await conn.commit();
      return { found: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── 退款逆向 ──────────────────────────────────────────────────────────────

  /**
   * 退款后删除 crm_learning_material_purchases 购买记录
   * 幂等：仅 paid 订单可逆向
   */
  async reverseOrder(orderNo: string): Promise<{ found: boolean; reversed: boolean }> {
    const conn = await this.learningOrdersRepo.getConnection();
    try {
      await conn.beginTransaction();

      const order = await this.learningOrdersRepo.findOrderForUpdate(conn, orderNo);
      if (!order) { await conn.commit(); return { found: false, reversed: false }; }
      if (order.status !== "paid") { await conn.commit(); return { found: true, reversed: false }; }

      const affected = await this.learningOrdersRepo.markAsRefundedInTransaction(conn, orderNo);
      if (affected === 0) { await conn.commit(); return { found: true, reversed: false }; }

      // 删除购买记录
      await conn.execute(
        "DELETE FROM crm_learning_material_purchases WHERE order_no = ? AND user_id = ?",
        [orderNo, order.user_id],
      );

      await conn.commit();
      console.log(`[learning-refund] 学习订单退款逆向完成: order_no=${orderNo}, plan=${order.plan_code}`);
      return { found: true, reversed: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── 工具方法 ──────────────────────────────────────────────────────────────

  private makeOrderNo(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `LE${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }

  private appendUrlParams(url: string, params: Record<string, string | number>): string {
    if (!url) return "";
    const query = Object.entries(params)
      .filter(([, value]) => String(value) !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    if (!query) return url;
    if (url.includes("?")) return `${url}&${query}`;
    return `${url}?${query}`;
  }
}
