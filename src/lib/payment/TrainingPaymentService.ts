/**
 * 研修班培训支付服务
 * Training Payment Service
 *
 * @module lib/payment/TrainingPaymentService
 * @description ARCH-PN（2026-09-11）：支付归一化重构——将 training-payment.ts 的函数式实现
 *              重构为类风格，与 PaymentService / LearningPaymentService 对齐。
 *
 *              职责边界：
 *              - 订单存于 training_orders 表（物理隔离）
 *              - 履约写入 training_orders（状态）+ crm_training_registrations（报名状态）
 *                + training_schedules（期次人数）
 *              - 定价从 TrainingRepo（training_courses 表）读取（零硬编码）
 *              - 支付渠道策略由 Orchestrator 通过 resolver 注入
 *
 *              与原有函数的对应关系：
 *              - createTrainingOrder()      → createOrder()
 *              - queryTrainingOrderStatus() → queryOrder()
 *              - fulfillTrainingOrder()     → fulfillOrder()
 *              - reverseTrainingOrder()     → reverseOrder()
 *              - fulfillMockTrainingOrder() → fulfillMockOrder()
 */
import "server-only";
import crypto from "crypto";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentProviderName } from "../types/payment";
import type { PaymentStrategy } from "./types";
import { resolvePaymentProvider } from "./pipeline/provider-resolver";
import { queryOrderWithGatewayPoll } from "./pipeline/query-pipeline";
import { fulfillInTransaction } from "./pipeline/fulfill-template";
import { TRAINING_FULFILL_ALLOWED } from "./pipeline/state-machine";
import { TRAINING_ORDER_EXPIRES_MS } from "@/shared/constants/time";
import { ORDER_STATUS } from "@/shared/constants/order-status";
import { toQrDataUrl } from "./qr";

// ── 接口定义 ──────────────────────────────────────────────────────────────────

export interface CreateTrainingOrderParams {
  scheduleId?: number | null;
  registrationId?: number | null;
  participantCount?: number;
  provider: string;
  contactName?: string;
  telephone?: string;
  clientIp?: string;
  /** 站点对外访问基址（如 https://host），用于生成可扫码的绝对二维码链接 */
  baseUrl?: string;
}

export interface TrainingOrderResult {
  order_no: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  qr_code: string | null;
  pay_url: string | null;
  status: string;
  expires_at: string;
}

// ── 服务类 ────────────────────────────────────────────────────────────────────

export class TrainingPaymentService {
  /** 策略解析器（由 Orchestrator 注入） */
  private getStrategy: ((provider: PaymentProviderName) => PaymentStrategy) | null = null;
  /** 支付模式（由 Orchestrator 注入） */
  private paymentMode: "live" | "mock" = "mock";
  /** hasStrategy 判断函数（由 Orchestrator 注入） */
  private hasStrategyFn: ((name: PaymentProviderName) => boolean) | null = null;

  constructor(private trainingRepo: TrainingRepo) {}

  /**
   * 注入策略解析器（由 Orchestrator.registerStrategy 调用）
   */
  setStrategyResolver(opts: {
    getStrategy: (provider: PaymentProviderName) => PaymentStrategy;
    hasStrategy: (name: PaymentProviderName) => boolean;
    paymentMode: "live" | "mock";
  }): void {
    this.getStrategy = opts.getStrategy;
    this.hasStrategyFn = opts.hasStrategy;
    this.paymentMode = opts.paymentMode;
  }

  /** 获取策略（内部使用） */
  private getStrategyOrThrow(provider: PaymentProviderName): PaymentStrategy {
    if (!this.getStrategy) throw new Error("TrainingPaymentService: strategy resolver not initialized");
    return this.getStrategy(provider);
  }

  // ── 创建订单 ──────────────────────────────────────────────────────────────

  /**
   * 创建培训支付订单
   * 从 DB 读取课程单价 → 计算总金额 → 生成二维码 → 写入 training_orders
   */
  async createOrder(params: CreateTrainingOrderParams): Promise<TrainingOrderResult> {
    const course = await this.trainingRepo.getActiveCourse();
    if (!course) throw new Error("COURSE_NOT_FOUND");

    const unitPrice = Number(course.unit_price || 0);
    if (unitPrice <= 0) throw new Error("COURSE_PRICE_INVALID");

    // 单笔人数上限护栏（审查 F25）
    const MAX_PARTICIPANTS_PER_ORDER = 50;
    const participantCount = Math.max(1, Math.min(MAX_PARTICIPANTS_PER_ORDER, Number(params.participantCount || 1)));
    const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

    // 容量校验（审查 F25）：下单即校验期次名额
    if (params.scheduleId) {
      const schedule = await this.trainingRepo.findScheduleById(Number(params.scheduleId));
      if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");
      if (schedule.capacity != null
        && Number(schedule.enrolled_count || 0) + participantCount > Number(schedule.capacity)) {
        throw new Error("SCHEDULE_CAPACITY_EXCEEDED");
      }
    }

    // 统一渠道解析
    const provider = resolvePaymentProvider(
      this.paymentMode,
      (name) => (this.hasStrategyFn?.(name) ?? false),
      params.provider,
    );

    const orderNo = this.makeOrderNo();
    const expiresAt = new Date(Date.now() + TRAINING_ORDER_EXPIRES_MS);

    // 通过支付策略生成二维码 / 支付链接
    const strategy = this.getStrategyOrThrow(provider);
    let gatewayResult: { pay_url: string; qr_code_url?: string };
    try {
      gatewayResult = await strategy.createPaymentUrl(
        orderNo,
        totalAmount,
        `${course.name_zh} ×${participantCount}`,
        undefined,
        params.clientIp,
      );
    } catch (err) {
      console.error(`[TrainingPaymentService] 支付网关创建链接失败 orderNo=${orderNo}:`, (err as Error).message);
      throw new Error("PAYMENT_GATEWAY_ERROR", { cause: err });
    }

    const payUrl = gatewayResult.pay_url || null;
    if (!payUrl) throw new Error("PAYMENT_GATEWAY_ERROR");
    if (!gatewayResult.qr_code_url) throw new Error("PAYMENT_QR_CODE_MISSING");
    const qrCode = await toQrDataUrl(gatewayResult.qr_code_url);

    await this.trainingRepo.createOrder({
      orderNo,
      courseId: course.id,
      scheduleId: params.scheduleId ?? null,
      registrationId: params.registrationId ?? null,
      participantCount,
      unitPrice,
      totalAmount,
      currency: course.currency || "CNY",
      provider,
      qrCode,
      payUrl,
      expiresAt,
      contactName: params.contactName || null,
      telephone: params.telephone || null,
    });

    return {
      order_no: orderNo,
      provider,
      amount: totalAmount,
      currency: course.currency || "CNY",
      qr_code: qrCode,
      pay_url: payUrl,
      status: ORDER_STATUS.PENDING,
      expires_at: expiresAt.toISOString(),
    };
  }

  // ── 查询订单 ──────────────────────────────────────────────────────────────

  /**
   * 查询培训订单状态
   * 使用统一查询管道：pending 时主动向网关轮询，已付则触发履约
   */
  async queryOrder(orderNo: string): Promise<{
    order_no: string; status: string; total_amount: number; paid_at: string | null;
  }> {
    const order = await this.trainingRepo.findOrderByNo(orderNo);
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const isPending = order.status === ORDER_STATUS.PENDING;
    const isExpiredLocally = order.status === ORDER_STATUS.EXPIRED;
    const isPastExpiry = new Date(order.expires_at).getTime() < Date.now();

    // 网关优先（审查 F24）：pending 与本地已判过期的订单都先查一次网关
    if (isPending || isExpiredLocally) {
      try {
        const strategy = this.getStrategyOrThrow(order.provider as PaymentProviderName);
        const result = await strategy.queryOrderStatus(orderNo, order.provider_trade_no || undefined);
        if (result.status === ORDER_STATUS.PAID) {
          await this.fulfillOrder(orderNo, result.provider_trade_no || null);
          return {
            order_no: orderNo,
            status: ORDER_STATUS.PAID,
            total_amount: Number(order.total_amount || 0),
            paid_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        if ((err as Error).message === "SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT") throw err;
      }

      if (isPending && isPastExpiry) {
        await this.trainingRepo.updateOrderStatus(orderNo, ORDER_STATUS.EXPIRED);
        return {
          order_no: orderNo,
          status: ORDER_STATUS.EXPIRED,
          total_amount: Number(order.total_amount || 0),
          paid_at: null,
        };
      }
    }

    return {
      order_no: orderNo,
      status: order.status,
      total_amount: Number(order.total_amount || 0),
      paid_at: order.paid_at ? new Date(order.paid_at).toISOString() : null,
    };
  }

  // ── 真实支付履约 ──────────────────────────────────────────────────────────

  /**
   * 培训订单支付履约（使用统一事务管道）
   * 标记订单已支付 + 更新报名支付状态 + 递增期次报名人数
   */
  async fulfillOrder(orderNo: string, providerTradeNo?: string | null): Promise<void> {
    await fulfillInTransaction({
      getConnection: () => this.trainingRepo.getConnection(),
      findOrderForUpdate: (conn, no) => this.trainingRepo.findOrderByNoForUpdate(conn, no).then(
        (row) => row as unknown as import("./pipeline/fulfill-template").FulfillableOrderRow | null,
      ),
      markAsPaid: (conn, no, tradeNo) =>
        this.trainingRepo.updateOrderStatusInTransaction(conn, no, ORDER_STATUS.PAID, tradeNo),
      onFulfill: async (conn, order) => {
        const rawOrder = order as unknown as {
          registration_id?: number | null;
          schedule_id?: number | null;
          participant_count?: number;
        };

        if (rawOrder.registration_id) {
          await this.trainingRepo.updateRegistrationPaymentInTransaction(
            conn, rawOrder.registration_id, (order as unknown as { id: number }).id, ORDER_STATUS.PAID,
          );
        }
        if (rawOrder.schedule_id) {
          const incremented = await this.trainingRepo.incrementEnrolledCountInTransaction(
            conn, rawOrder.schedule_id, rawOrder.participant_count,
          );
          if (incremented === 0) {
            throw new Error("SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT");
          }
        }
      },
      orderNo,
      providerTradeNo,
      allowedStatuses: [...TRAINING_FULFILL_ALLOWED],
    });
  }

  // ── Mock 支付履约 ─────────────────────────────────────────────────────────

  /**
   * Mock 支付履约（培训订单）
   * 供 Orchestrator.fulfillMockOrder 路由调用
   */
  async fulfillMockOrder(orderNo: string, rawNotify: string): Promise<{ found: boolean }> {
    const order = await this.trainingRepo.findOrderByNo(orderNo);
    if (!order) return { found: false };
    if (order.status === ORDER_STATUS.PAID) return { found: true }; // 幂等
    await this.fulfillOrder(orderNo, `mock_${rawNotify}`);
    return { found: true };
  }

  // ── 退款逆向 ──────────────────────────────────────────────────────────────

  /**
   * 培训订单退款逆向（TRADE_CLOSED 回调）
   * 事务封装：标记订单 refunded + 回滚报名支付状态 + 递减期次人数
   * 与 fulfillOrder 对称：幂等，仅 paid 订单可逆向
   */
  async reverseOrder(orderNo: string): Promise<{ found: boolean; reversed: boolean }> {
    const conn = await this.trainingRepo.getConnection();
    try {
      await conn.beginTransaction();

      const order = await this.trainingRepo.findOrderByNoForUpdate(conn, orderNo);
      if (!order) {
        await conn.commit();
        return { found: false, reversed: false };
      }
      // 幂等 + 状态机：仅 paid 可逆向
      if (order.status !== ORDER_STATUS.PAID) {
        await conn.commit();
        return { found: true, reversed: false };
      }

      // 标记订单 refunded
      await conn.execute(
        "UPDATE training_orders SET status = 'refunded' WHERE order_no = ? AND status = 'paid'",
        [orderNo],
      );

      // 回滚报名支付状态
      if (order.registration_id) {
        await conn.execute(
          "UPDATE crm_training_registrations SET payment_status = 'refunded', order_id = NULL WHERE id = ?",
          [order.registration_id],
        );
      }

      // 递减期次报名人数（与履约 increment 对称）
      if (order.schedule_id) {
        await conn.execute(
          "UPDATE training_schedules SET enrolled_count = GREATEST(0, enrolled_count - ?) WHERE id = ?",
          [order.participant_count, order.schedule_id],
        );
      }

      await conn.commit();
      console.log(`[training-refund] 培训订单退款逆向完成: order_no=${orderNo}`);
      return { found: true, reversed: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── 工具方法 ──────────────────────────────────────────────────────────────

  /** 生成培训订单号：TR + 日期 + 随机 hex */
  private makeOrderNo(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `TR${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }
}
