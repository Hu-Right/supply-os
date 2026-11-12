/**
 * 学习资料支付服务
 * Learning Payment Service
 *
 * @module lib/payment/learning-payment
 * @description ARCH-B+（2026-09-01）：学习资料 / 打包套餐的订单创建、查询、履约与退款。
 *              从 PaymentService + activate.ts + mock.ts + reverse.ts 的学习分支提取为独立服务。
 *
 *              职责边界：
 *              - 订单存于统一表 orders（product_kind IN material/bundle）
 *              - 履约写入 learning_material_purchases（权益表，不变）
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
import { queryOrderWithGatewayPoll } from "./pipeline/query-pipeline";
import {
  classifyProductCode,
  stripProductPrefix,
  PRODUCT_KIND,
} from "@/shared/constants/product-kind";
import { resolveLearningProduct } from "./products";

export class LearningPaymentService {
  /** 策略解析器（由 Orchestrator 注入） */
  private getStrategyFn: ((provider: PaymentProviderName) => PaymentStrategy) | null = null;

  constructor(
    private learningOrdersRepo: LearningOrdersRepo,
    private learningMaterialsRepo: LearningMaterialsRepo,
  ) {}

  /**
   * 注入策略解析器（由 Orchestrator.registerStrategy 调用）
   * ARCH-PN（2026-09-11）：策略注册收归 Orchestrator 统一管理。
   */
  setStrategyResolver(opts: {
    getStrategy: (provider: PaymentProviderName) => PaymentStrategy;
  }): void {
    this.getStrategyFn = opts.getStrategy;
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    if (!this.getStrategyFn) throw new Error("LearningPaymentService: strategy resolver not initialized");
    return this.getStrategyFn(provider);
  }

  // ── 创建订单 ──────────────────────────────────────────────────────────────

  async createOrder(params: {
    userId: number;
    planCode: string;
    provider: PaymentProviderName;
    returnUrl?: string;
    clientIp?: string;
  }): Promise<{
    orderNo: string;
    provider: PaymentProviderName;
    amount: number;
    currency: string;
    payUrl: string;
    qrCodeUrl: string | undefined;
    status: "pending";
    createdAt: string;
  }> {
    const { userId, planCode, provider } = params;

    // ── 服务端权威定价（审查 F2）──
    // 取价与归一收口 lib/payment/products；错误码映射保持原样
    const resolved = await resolveLearningProduct(
      planCode,
      (materialId) => this.learningMaterialsRepo.findByMaterialId(materialId),
    );
    if (!resolved.ok) {
      throw new Error(
        resolved.reason === "material_not_found" ? "MATERIAL_NOT_FOUND"
          : resolved.reason === "bundle_not_found" ? "BUNDLE_NOT_FOUND"
            : "INVALID_LEARNING_PLAN_CODE",
      );
    }
    const amount = resolved.product.unitPrice;
    const planName = resolved.product.name;

    if (amount <= 0) throw new Error("INVALID_AMOUNT");

    const orderNo = this.makeOrderNo();
    const strategy = this.getStrategy(provider);
    const returnUrl = this.appendUrlParams(params.returnUrl || "", { order_no: orderNo });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo, amount, planName, returnUrl, params.clientIp,
    );

    const rawRequest = JSON.stringify({
      plan_code: planCode, amount,
    });

    await this.learningOrdersRepo.createOrder({
      userId, orderNo, provider, planCode, productName: planName, amount,
      currency: "CNY", payUrl: pay_url, qrCodeUrl: qr_code_url || null, rawRequest,
    });

    return {
      // 对外响应体：契约键 camelCase（红线②）；pay_url/qr_code_url 是渠道策略的第三方字段镜像
      orderNo, provider, amount, currency: "CNY",
      payUrl: pay_url, qrCodeUrl: qr_code_url, status: "pending",
      createdAt: new Date().toISOString(),
    };
  }

  // ── 查询订单（使用统一查询管道） ────────────────────────────────────────────

  /**
   * ARCH-PN（2026-09-11）：委托 queryOrderWithGatewayPoll 管道，
   * 消除与 PaymentService.queryOrder() 的重复逻辑。
   */
  async queryOrder(orderNo: string, providerTradeNo?: string): Promise<{
    orderNo: string;
    status: string;
    provider: PaymentProviderName;
    planCode: string;
    amount: number;
    currency: string;
    providerTradeNo?: string;
    paidAt?: string;
  } | null> {
    const dbOrder = await this.learningOrdersRepo.findByOrderNo(orderNo);
    if (!dbOrder) return null;

    const result = await queryOrderWithGatewayPoll({
      findOrder: async () => dbOrder,
      getStrategy: (p) => this.getStrategy(p),
      onFulfill: (no, tradeNo) => this.fulfillOrder(no, tradeNo),
      orderNo,
      providerTradeNo,
    });

    return {
      orderNo: result.orderNo,
      status: result.status,
      provider: (result.provider || dbOrder.provider) as PaymentProviderName,
      planCode: result.planCode || dbOrder.plan_code,
      amount: result.amount ?? Number(dbOrder.amount),
      currency: result.currency || dbOrder.currency,
      providerTradeNo: result.providerTradeNo,
      paidAt: result.paidAt,
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

      // 类型判定与剥前缀收口 shared/constants/product-kind
      const productKind = classifyProductCode(order.plan_code);

      // 单资料购买
      if (productKind === PRODUCT_KIND.MATERIAL) {
        const materialId = stripProductPrefix(order.plan_code);
        await this.learningMaterialsRepo.recordPurchaseInTransaction(
          conn, order.user_id!, materialId, orderNo, Number(order.amount),
        );
        await conn.commit();
        return;
      }

      // 打包套餐购买：从 learning-bundles 静态配置获取条目清单
      if (productKind === PRODUCT_KIND.BUNDLE) {
        const bundle = findLearningBundle(stripProductPrefix(order.plan_code));
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

      const productKind = classifyProductCode(order.plan_code);

      if (productKind === PRODUCT_KIND.MATERIAL) {
        const materialId = stripProductPrefix(order.plan_code);
        await this.learningMaterialsRepo.recordPurchaseInTransaction(
          conn, order.user_id!, materialId, orderNo, Number(order.amount),
        );
        await conn.commit();
        return { found: true };
      }

      if (productKind === PRODUCT_KIND.BUNDLE) {
        const bundle = findLearningBundle(stripProductPrefix(order.plan_code));
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
   * 退款后删除 learning_material_purchases 购买记录
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
        "DELETE FROM learning_material_purchases WHERE order_no = ? AND user_id = ?",
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
