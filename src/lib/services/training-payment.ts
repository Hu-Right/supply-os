/**
 * 研修班培训支付服务
 * Training Payment Service
 *
 * @module server/services/training-payment
 * @description 培训订单的创建、状态查询与支付履约。
 *              - 单价从 training_courses 表读取（零硬编码）
 *              - 二维码复用现有支付策略（Alipay/Wechat/Mock）
 *              - 履约：标记订单已支付 + 更新报名支付状态 + 递增期次人数
 *              与会员支付（paymentsRepo）物理隔离，订单存于 training_orders 表。
 */
import crypto from "crypto";
import type { AppContext } from "../db/context";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentProviderName } from "../types/payment";
import { TRAINING_ORDER_EXPIRES_MS } from "@/shared/constants/time";
import { toQrDataUrl } from "../payment/qr";

export interface CreateTrainingOrderParams {
  courseId: number;
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

/** 生成培训订单号：TR + 日期 + 随机 hex */
function makeTrainingOrderNo(): string {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `TR${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

/**
 * 解析实际可用的支付渠道，与会员区行为对齐：
 * - live 模式下渠道未注册（未配置密钥）→ 抛 PAYMENT_PROVIDER_UNAVAILABLE，
 *   由前端给出“暂未开通”提示，不再静默回退 mock；
 * - mock 模式（开发环境）下统一走 mock 闭环。
 */
function resolveProvider(ctx: AppContext, requested: string): PaymentProviderName {
  const { paymentMode, paymentService } = ctx.payment;
  if (paymentMode === "live") {
    if (requested === "alipay" || requested === "wechat") {
      try {
        paymentService.getStrategy(requested as PaymentProviderName);
        return requested as PaymentProviderName;
      } catch {
        // 渠道未注册（未配置密钥）→ 明确拒绝，不回退 mock
      }
    }
    throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return "mock";
}

/**
 * 创建培训支付订单
 * 从 DB 读取课程单价 → 计算总金额 → 生成二维码 → 写入 training_orders
 */
export async function createTrainingOrder(
  ctx: AppContext,
  trainingRepo: TrainingRepo,
  params: CreateTrainingOrderParams,
): Promise<TrainingOrderResult> {
  const course = await trainingRepo.getActiveCourse();
  if (!course) throw new Error("COURSE_NOT_FOUND");

  const unitPrice = Number(course.unit_price || 0);
  if (unitPrice <= 0) throw new Error("COURSE_PRICE_INVALID");

  // 单笔人数上限护栏（审查 F25）：防极端值下单（金额可拒付但名额会被占）
  const MAX_PARTICIPANTS_PER_ORDER = 50;
  const participantCount = Math.max(1, Math.min(MAX_PARTICIPANTS_PER_ORDER, Number(params.participantCount || 1)));
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  // 容量校验（审查 F25）：下单即校验期次名额，支付前尽早失败；
  // 权威校验在履约事务内（incrementEnrolledCountInTransaction 容量护栏）
  if (params.scheduleId) {
    const schedule = await trainingRepo.findScheduleById(Number(params.scheduleId));
    if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");
    if (schedule.capacity != null
      && Number(schedule.enrolled_count || 0) + participantCount > Number(schedule.capacity)) {
      throw new Error("SCHEDULE_CAPACITY_EXCEEDED");
    }
  }

  const provider = resolveProvider(ctx, params.provider);
  const orderNo = makeTrainingOrderNo();

  // 订单 30 分钟过期
  const expiresAt = new Date(Date.now() + TRAINING_ORDER_EXPIRES_MS);

  // 通过支付策略生成二维码 / 支付链接
  // payUrl：存库值（alipay 为自动提交的 HTML 表单，由跳转端点渲染）
  // clientPayUrl：下发前端的可访问地址（alipay 为跳转端点路径，与会员区一致）
  // 网关失败时明确报错，不创建无二维码/无链接的空订单
  let gatewayResult: { pay_url: string; qr_code_url?: string };
  try {
    const strategy = ctx.payment.paymentService.getStrategy(provider);
    gatewayResult = await strategy.createPaymentUrl(
      orderNo,
      totalAmount,
      `${course.name_zh} ×${participantCount}`,
      undefined,
      params.clientIp,
    );
  } catch (err) {
    console.error(`[TrainingPayment] 支付网关创建链接失败 orderNo=${orderNo}:`, (err as Error).message);
    throw new Error("PAYMENT_GATEWAY_ERROR", { cause: err });
  }
  const payUrl = gatewayResult.pay_url || null;
  const clientPayUrl = payUrl;
  if (!payUrl) throw new Error("PAYMENT_GATEWAY_ERROR");
  
  // 必须使用支付渠道返回的原生二维码（如支付宝当面付 precreate）
  // 如果没有原生二维码，直接报错，不回退到跳转端点二维码
  if (!gatewayResult.qr_code_url) {
    throw new Error("PAYMENT_QR_CODE_MISSING");
  }
  const qrCode = await toQrDataUrl(gatewayResult.qr_code_url);

  await trainingRepo.createOrder({
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
    pay_url: clientPayUrl,
    status: "pending",
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * 培训订单支付履约（事务封装：悲观锁 + 幂等）
 * 标记订单已支付 + 更新报名支付状态 + 递增期次报名人数
 * 与会员履约 activatePaidOrder 对齐：SELECT ... FOR UPDATE 防并发重复发放
 */
export async function fulfillTrainingOrder(
  trainingRepo: TrainingRepo,
  orderNo: string,
  providerTradeNo?: string | null,
): Promise<void> {
  const conn = await trainingRepo.getConnection();
  try {
    await conn.beginTransaction();

    // 悲观锁：SELECT ... FOR UPDATE 防止并发重复发放
    const order = await trainingRepo.findOrderByNoForUpdate(conn, orderNo);
    if (!order) { await conn.commit(); return; }

    // 状态机白名单（审查 F19/F24）：pending 正常履约；expired 允许"迟到付款"
    // 复活（钱货两清，过期判定先于网关确认）；其余终态一律拒绝
    if (order.status !== "pending" && order.status !== "expired") { await conn.commit(); return; }

    await trainingRepo.updateOrderStatusInTransaction(conn, orderNo, "paid", providerTradeNo || null);

    if (order.registration_id) {
      await trainingRepo.updateRegistrationPaymentInTransaction(conn, order.registration_id, order.id, "paid");
    }
    if (order.schedule_id) {
      const incremented = await trainingRepo.incrementEnrolledCountInTransaction(
        conn, order.schedule_id, order.participant_count,
      );
      if (incremented === 0) {
        // 容量在支付等待期被并发占满：钱已收但无名额——回滚保持订单原状态，
        // 抛错告警转人工退款（审查 F25）
        throw new Error("SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT");
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 查询培训订单状态
 * pending 时主动向支付网关轮询，已支付则触发履约
 */
export async function queryTrainingOrderStatus(
  ctx: AppContext,
  trainingRepo: TrainingRepo,
  orderNo: string,
): Promise<{ order_no: string; status: string; total_amount: number; paid_at: string | null }> {
  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const isPending = order.status === "pending";
  const isExpiredLocally = order.status === "expired";
  const isPastExpiry = new Date(order.expires_at).getTime() < Date.now();

  // 网关优先（审查 F24）：pending 与本地已判过期的订单都先查一次网关——
  // 防止"用户已付款但本地过期判定先行"导致扣款无履约；
  // 只有网关确认未支付（或查询失败）才把 pending 落库为 expired
  if (isPending || isExpiredLocally) {
    try {
      const strategy = ctx.payment.paymentService.getStrategy(order.provider as PaymentProviderName);
      const result = await strategy.queryOrderStatus(orderNo, order.provider_trade_no || undefined);
      if (result.status === "paid") {
        await fulfillTrainingOrder(trainingRepo, orderNo, result.provider_trade_no || null);
        return {
          order_no: orderNo,
          status: "paid",
          total_amount: Number(order.total_amount || 0),
          paid_at: new Date().toISOString(),
        };
      }
    } catch (err) {
      // 网关不可用时保持数据库状态；容量占满（SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT）
      // 同样向上抛出，由路由转 500 告警转人工
      if ((err as Error).message === "SCHEDULE_CAPACITY_EXCEEDED_AT_FULFILLMENT") throw err;
    }

    if (isPending && isPastExpiry) {
      await trainingRepo.updateOrderStatus(orderNo, "expired");
      return {
        order_no: orderNo,
        status: "expired",
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
