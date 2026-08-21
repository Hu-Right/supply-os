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
import type { AppContext } from "../context";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentProviderName } from "../types/payment";

export interface CreateTrainingOrderParams {
  courseId: number;
  scheduleId?: number | null;
  registrationId?: number | null;
  participantCount?: number;
  provider: string;
  contactName?: string;
  telephone?: string;
  clientIp?: string;
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

/** 解析实际可用的支付渠道（live 且渠道已注册才用真实网关，否则回退 mock） */
function resolveProvider(ctx: AppContext, requested: string): PaymentProviderName {
  const { paymentMode, paymentService } = ctx.payment;
  if (paymentMode === "live" && (requested === "alipay" || requested === "wechat")) {
    try {
      paymentService.getStrategy(requested as PaymentProviderName);
      return requested as PaymentProviderName;
    } catch {
      // 渠道未注册（未配置密钥）→ 回退 mock
    }
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

  const participantCount = Math.max(1, Number(params.participantCount || 1));
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  const provider = resolveProvider(ctx, params.provider);
  const orderNo = makeTrainingOrderNo();

  // 订单 30 分钟过期
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  // 通过支付策略生成二维码 / 支付链接
  let qrCode: string | null = null;
  let payUrl: string | null = null;
  try {
    const strategy = ctx.payment.paymentService.getStrategy(provider);
    const result = await strategy.createPaymentUrl(
      orderNo,
      totalAmount,
      `${course.name_zh} ×${participantCount}`,
      undefined,
      params.clientIp,
    );
    payUrl = result.pay_url || null;
    qrCode = result.qr_code_url || null;
  } catch {
    // 策略不可用时二维码留空，前端展示"联系顾问"兜底
  }

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
    pay_url: payUrl,
    status: "pending",
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * 培训订单支付履约（幂等）
 * 标记订单已支付 + 更新报名支付状态 + 递增期次报名人数
 */
export async function fulfillTrainingOrder(
  trainingRepo: TrainingRepo,
  orderNo: string,
  providerTradeNo?: string | null,
): Promise<void> {
  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return;
  // 幂等：已支付直接跳过
  if (order.status === "paid") return;

  await trainingRepo.updateOrderStatus(orderNo, "paid", providerTradeNo || null);

  if (order.registration_id) {
    await trainingRepo.updateRegistrationPayment(order.registration_id, order.id, "paid");
  }
  if (order.schedule_id) {
    await trainingRepo.incrementEnrolledCount(order.schedule_id, order.participant_count);
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

  // 过期处理
  if (order.status === "pending" && new Date(order.expires_at).getTime() < Date.now()) {
    await trainingRepo.updateOrderStatus(orderNo, "expired");
    return {
      order_no: orderNo,
      status: "expired",
      total_amount: Number(order.total_amount || 0),
      paid_at: null,
    };
  }

  // pending 时主动轮询支付网关
  if (order.status === "pending") {
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
    } catch {
      // 网关不可用时保持数据库状态
    }
  }

  return {
    order_no: orderNo,
    status: order.status,
    total_amount: Number(order.total_amount || 0),
    paid_at: order.paid_at ? new Date(order.paid_at).toISOString() : null,
  };
}
