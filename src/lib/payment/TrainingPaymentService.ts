/**
 * 研修班培训支付服务
 * Training Payment Service
 *
 * @module lib/payment/TrainingPaymentService
 * @description ARCH-PN（2026-09-11）：支付归一化重构——将原 training-payment 函数式实现
 *              重构为类风格，与 PaymentService / LearningPaymentService 对齐；
 *              旧的向后兼容函数层（createTrainingOrder 等）已于 2026-10-12 删除，
 *              调用方一律直连本类（createOrder/queryOrder/fulfillOrder/reverseOrder/fulfillMockOrder）。
 *
 *              职责边界：
 *              - 订单存于统一表 orders（product_kind='course'）
 *              - 报名行（training_enrollments）在**下单前**已由报名接口写全，
 *                本服务只在下单时把 order_id 绑上去；履约/退款不再回写报名行
 *                （支付状态唯一权威是 orders.status，2026-11-13 起取消双写）
 *              - 履约另写 training_schedules（期次人数）
 *              - 定价从 TrainingRepo（training_courses 表）读取（零硬编码），
 *                取价与归一由 lib/payment/products 统一（courseProductOf）
 *              - 支付渠道策略由 Orchestrator 通过 resolver 注入
 */
import "server-only";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentProviderName } from "../types/payment";
import type { PaymentStrategy } from "./types";
import { nextOrderNo } from "./order-no";
import { PRODUCT_KIND } from "@/shared/constants/product-kind";
import { courseProductOf } from "./products";
import { resolvePaymentProvider } from "./pipeline/provider-resolver";
import { fulfillInTransaction } from "./pipeline/fulfill-template";
import { TRAINING_FULFILL_ALLOWED } from "./pipeline/state-machine";
import { TRAINING_ORDER_EXPIRES_MS } from "@/shared/constants/time";
import { ORDER_STATUS } from "@/shared/constants/order-status";
import { toQrDataUrl } from "./qr";

// ── 接口定义 ──────────────────────────────────────────────────────────────────

export interface CreateTrainingOrderParams {
  /** 下单人（orders.user_id 已收 NOT NULL：培训下单入口强制登录，匿单语义退役） */
  userId: number;
  scheduleId?: number | null;
  /**
   * 本单覆盖的报名行 id（training_enrollments.id），必填。
   * 2026-11-13 收敛后：报名先落库（一人一行），下单只做绑定；
   * 人数由行数决定，不再采信客户端的 participant_count。
   */
  registrationIds?: number[] | null;
  provider: string;
  contactName?: string;
  telephone?: string;
  clientIp?: string;
  /** 站点对外访问基址（如 https://host），用于生成可扫码的绝对二维码链接 */
  baseUrl?: string;
}

/**
 * 建单结果——被 POST /api/training/orders 整块透出，是对外响应体（红线② camelCase）。
 * qrCodeUrl / payUrl 与会员侧 OrderInfo 同名同义（都是二维码图片 data URL / 收银台链接），
 * 不再用第三个名字 qr_code。
 */
export interface TrainingOrderResult {
  orderNo: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  qrCodeUrl: string | null;
  payUrl: string | null;
  status: string;
  expiresAt: string;
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
   * 从 DB 读取课程单价 → 计算总金额 → 生成二维码 → 写入 orders（kind='course'）
   */
  async createOrder(params: CreateTrainingOrderParams): Promise<TrainingOrderResult> {
    const course = await this.trainingRepo.getActiveCourse();
    if (!course) throw new Error("COURSE_NOT_FOUND");

    // 取价与归一收口 lib/payment/products；错误码与人数护栏仍在本层
    const product = courseProductOf(course);
    const unitPrice = product.unitPrice;
    if (unitPrice <= 0) throw new Error("COURSE_PRICE_INVALID");

    // 本单覆盖的报名行：人数与期次以报名行为准（不采信客户端传来的 count/schedule）
    const MAX_PARTICIPANTS_PER_ORDER = 50;
    const registrationIds = [
      ...new Set((params.registrationIds ?? []).filter((id) => Number.isFinite(id))),
    ];
    if (registrationIds.length === 0) throw new Error("REGISTRATION_REQUIRED");
    if (registrationIds.length > MAX_PARTICIPANTS_PER_ORDER) throw new Error("PARTICIPANT_LIMIT_EXCEEDED");

    const enrollments = await this.trainingRepo.findEnrollmentsByIds(registrationIds, params.userId);
    if (enrollments.length !== registrationIds.length) throw new Error("REGISTRATION_NOT_FOUND");
    if (enrollments.some((row) => row.order_id != null)) throw new Error("REGISTRATION_ALREADY_BOUND");

    const scheduleIds = [
      ...new Set(enrollments.map((row) => row.schedule_id).filter((v): v is number => v != null)),
    ];
    if (scheduleIds.length > 1) throw new Error("REGISTRATION_SCHEDULE_MISMATCH");
    const scheduleId = params.scheduleId != null ? Number(params.scheduleId) : scheduleIds[0] ?? null;
    if (scheduleIds.length === 1 && scheduleId != null && scheduleIds[0] !== scheduleId) {
      throw new Error("REGISTRATION_SCHEDULE_MISMATCH");
    }

    const participantCount = enrollments.length;
    const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

    // 容量校验（审查 F25）：下单即校验期次名额
    if (scheduleId) {
      const schedule = await this.trainingRepo.findScheduleById(scheduleId);
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

    const orderNo = nextOrderNo(PRODUCT_KIND.COURSE);
    const expiresAt = new Date(Date.now() + TRAINING_ORDER_EXPIRES_MS);

    // 通过支付策略生成二维码 / 支付链接
    const strategy = this.getStrategyOrThrow(provider);
    let gatewayResult: { pay_url: string; qr_code_url?: string };
    try {
      gatewayResult = await strategy.createPaymentUrl(
        orderNo,
        totalAmount,
        `${product.name} ×${participantCount}`,
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

    const orderId = await this.trainingRepo.createOrder({
      orderNo,
      userId: params.userId,
      courseId: course.id,
      productName: product.name,
      scheduleId,
      registrationId: registrationIds[0] ?? null,
      participantCount,
      unitPrice,
      totalAmount,
      currency: product.currency,
      provider,
      qrCode,
      payUrl,
      expiresAt,
      contactName: params.contactName || null,
      telephone: params.telephone || null,
    });

    // 把这批报名行绑到订单上（只绑 order_id IS NULL 的行）。
    // 校验与绑定之间仍有并发窗口：少绑一行就关单，避免出现「付了钱、名单却挂在别的单上」。
    const bound = await this.trainingRepo.bindEnrollmentsToOrder(orderId, registrationIds, params.userId);
    if (bound !== registrationIds.length) {
      await this.trainingRepo.updateOrderStatus(orderNo, ORDER_STATUS.CLOSED);
      throw new Error("REGISTRATION_BOUND_RACE");
    }

    return {
      orderNo,
      provider,
      amount: totalAmount,
      currency: product.currency,
      qrCodeUrl: qrCode,
      payUrl,
      status: ORDER_STATUS.PENDING,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ── 查询订单 ──────────────────────────────────────────────────────────────

  /**
   * 查询培训订单状态（对外响应体，金额键与其余三个业务分支一致用 amount）
   * 使用统一查询管道：pending 时主动向网关轮询，已付则触发履约
   */
  async queryOrder(orderNo: string): Promise<{
    orderNo: string; status: string; amount: number; paidAt: string | null;
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
            orderNo,
            status: ORDER_STATUS.PAID,
            amount: Number(order.total_amount || 0),
            paidAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        if ((err as Error).message === "SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT") throw err;
      }

      if (isPending && isPastExpiry) {
        await this.trainingRepo.updateOrderStatus(orderNo, ORDER_STATUS.EXPIRED);
        return {
          orderNo,
          status: ORDER_STATUS.EXPIRED,
          amount: Number(order.total_amount || 0),
          paidAt: null,
        };
      }
    }

    return {
      orderNo,
      status: order.status,
      amount: Number(order.total_amount || 0),
      paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null,
    };
  }

  // ── 真实支付履约 ──────────────────────────────────────────────────────────

  /**
   * 培训订单支付履约（使用统一事务管道）
   * 标记订单已支付 + 递增期次报名人数；报名行不回写（状态唯一权威是 orders.status）
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
          schedule_id?: number | null;
          participant_count?: number;
        };

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
        "UPDATE orders SET status = 'refunded', refund_amount = amount, refunded_at = NOW(), updated_at = NOW() \
          WHERE order_no = ? AND product_kind = 'course' AND status = 'paid'",
        [orderNo],
      );

      // 报名行不回写：退款后 order_id 仍指向本单，学员名单作为历史留档；
      // 是否已退款由 orders.status='refunded' 判定（单一事实源）。

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
}
