/**
 * 支付履约（权益发放）
 * Payment fulfillment: entitlement granting
 *
 * @module server/payment/fulfillment
 * @description 统一履约入口：
 *              - activatePaidOrder: 真实支付回调履约（事务版，悲观锁）
 *              - fulfillMockPayment: mock 支付履约（非事务）
 *              - activateSubscription: 订阅开通
 *              - createLegacyOrder: legacy 下单
 */
import type { PaymentsRepo } from "../repos/payments.repo";
import type { MembershipRepo } from "../repos/membership.repo";

// ── 固定套餐表（billing/subscribe 专用） ──────────────────────────────────────

/** billing/subscribe 的固定套餐表（独立于 crm_membership_plans 表） */
export const BILLING_PLANS: Record<string, { days: number | null; price: number; quota: number }> = {
  single: { days: null, price: 89, quota: 1 },
  trial_3: { days: null, price: 99, quota: 3 },
  week_21: { days: 7, price: 299, quota: 21 },
  annual: { days: 365, price: 5600, quota: 1095 },
};

// ── 真实支付回调履约（事务版） ────────────────────────────────────────────────

/**
 * 激活已支付订单（事务封装：悲观锁 + 幂等 + 权益发放）
 * 用于真实支付回调（支付宝/微信异步通知）
 */
export async function activatePaidOrder(
  paymentsRepo: PaymentsRepo,
  orderNo: string,
  providerTradeNo?: string,
): Promise<void> {
  const conn = await paymentsRepo.getConnection();
  try {
    await conn.beginTransaction();

    // 悲观锁：SELECT ... FOR UPDATE 防止并发重复发放权益
    const order = await paymentsRepo.findOrderForUpdate(conn, orderNo);
    if (!order) { await conn.commit(); return; }

    // 幂等保护：已支付的订单直接跳过
    if (order.status === "paid") { await conn.commit(); return; }

    await paymentsRepo.markAsPaidInTransaction(conn, orderNo, providerTradeNo || null);

    const plan = await paymentsRepo.findPlanInTransaction(conn, order.plan_code);
    if (!plan) { await conn.commit(); return; }

    if (plan.plan_type === "single") {
      // 单次解锁卡：创建 entitlement 额度（用户后续浏览公告时再消耗）
      if (await paymentsRepo.hasEntitlementForOrder(conn, orderNo)) {
        await conn.commit();
        return;
      }
      await paymentsRepo.insertEntitlementInTransaction(conn, {
        userKey: order.user_key,
        orderNo,
        planCode: order.plan_code,
        quotaTotal: Number(plan.unlock_quota || 1),
        durationDays: plan.duration_days,
      });
      await paymentsRepo.promoteToVipInTransaction(conn, order.user_key);
      await conn.commit();
      return;
    }

    // 订阅计划：检查是否已发放权益
    if (await paymentsRepo.hasEntitlementForOrder(conn, orderNo)) {
      await conn.commit();
      return;
    }

    await paymentsRepo.createSubscriptionInTransaction(
      conn, order.user_key, order.plan_code, plan.duration_days,
    );

    await paymentsRepo.insertEntitlementInTransaction(conn, {
      userKey: order.user_key,
      orderNo,
      planCode: order.plan_code,
      quotaTotal: Number(plan.unlock_quota || 1),
      durationDays: plan.duration_days,
    });

    await paymentsRepo.promoteToVipInTransaction(conn, order.user_key);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Mock 支付履约 ─────────────────────────────────────────────────────────────

/**
 * mock 支付履约（POST /api/payments/:orderNo/mock-paid）：
 * 已 paid 幂等返回；否则按套餐发放额度、非单次套餐写订阅并升 VIP、
 * 绑定公告时记录订阅兴趣。
 */
export async function fulfillMockPayment(
  payments: PaymentsRepo,
  membership: MembershipRepo,
  params: { orderNo: string; rawNotify: string },
): Promise<{ found: boolean }> {
  const order = await payments.findByOrderNo(params.orderNo);
  if (!order) return { found: false };
  if (order.status !== "paid") {
    const plan = (await membership.findPlanByCodeForFulfillment(order.plan_code))
      ?? { unlock_quota: 1, duration_days: null as number | null, plan_type: "single" as string };
    await payments.markAsMockPaid(params.orderNo, params.rawNotify);
    await payments.insertEntitlement({
      userKey: order.user_key,
      orderNo: params.orderNo,
      planCode: order.plan_code,
      quotaTotal: Math.max(1, Number(plan.unlock_quota || 1)),
      durationDays: plan.duration_days ?? null,
    });
    if (plan.plan_type !== "single") {
      await payments.createSubscription(order.user_key, order.plan_code, plan.duration_days ?? null);
      await payments.promoteToVip(order.user_key);
    }
    if (order.notice_id) {
      await payments.upsertNoticeInterest(order.user_key, order.notice_id);
    }
  }
  return { found: true };
}

// ── 订阅开通 ──────────────────────────────────────────────────────────────────

/** 开通订阅（POST /api/billing/subscribe）：写订阅 + 升 VIP */
export async function activateSubscription(
  repo: PaymentsRepo,
  params: { userKey: string; planCode: string },
): Promise<{ planCode: string; price: number; quota: number }> {
  const plan = BILLING_PLANS[params.planCode] || BILLING_PLANS.single;
  await repo.createSubscription(params.userKey, params.planCode, plan.days);
  await repo.promoteToVip(params.userKey);
  return { planCode: params.planCode, price: plan.price, quota: plan.quota };
}

// ── Legacy 下单 ───────────────────────────────────────────────────────────────

/**
 * legacy 下单（POST /api/payments/create）：查活跃套餐 + 落 pending 订单。
 * 返回 null 表示套餐不存在（路由返回 404 PLAN_NOT_FOUND）。
 */
export async function createLegacyOrder(
  payments: PaymentsRepo,
  membership: MembershipRepo,
  params: {
    userKey: string;
    provider: string;
    planCode: string;
    noticeId: number | null;
    orderNo: string;
    payUrl: string;
    rawRequest: string;
  },
): Promise<{ planName: string; amount: number; currency: string } | null> {
  const plan = await membership.findPlanByCode(params.planCode);
  if (!plan) return null;
  await payments.createOrder({
    userKey: params.userKey,
    orderNo: params.orderNo,
    provider: params.provider,
    planCode: params.planCode,
    noticeId: params.noticeId,
    amount: Number(plan.price),
    currency: plan.currency || "CNY",
    payUrl: params.payUrl,
    qrCodeUrl: null,
    rawRequest: params.rawRequest,
  });
  return { planName: plan.name, amount: Number(plan.price), currency: plan.currency || "CNY" };
}
