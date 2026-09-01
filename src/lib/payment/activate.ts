/**
 * 真实支付履约 + 订阅开通
 * Real payment fulfillment + subscription activation
 *
 * @module lib/payment/activate
 * @description ARCH-P3a（2026-08-31）：从 fulfillment.ts 拆分。
 *              - activatePaidOrder: 真实支付回调履约（事务版，悲观锁）
 *              - activateSubscription: 订阅开通
 */
import type { PaymentsRepo } from "../repos/payments.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import type { PaymentOrderRow } from "../repos/types";
import { performUpgradeInTransaction } from "./upgrade";

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

    // 状态机白名单（审查 F19）：仅 pending 订单可履约；
    // closed/refunded/expired 等终态不得被迟到通知复活重新发放权益
    if (order.status !== "pending") { await conn.commit(); return; }

    await paymentsRepo.markAsPaidInTransaction(conn, orderNo, providerTradeNo || null);

    // ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单已拆分至 learning_orders 表，
    // 由 LearningPaymentService.fulfillOrder 独立履约，不再经过此函数。

    // 升级订单走独立的平滑升级履约（补差价，次数保留，有效期追溯）
    if (order.order_type === "upgrade") {
      await performUpgradeInTransaction(conn, paymentsRepo, order);
      await conn.commit();
      return;
    }

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
      // §2.0 R1（Phase 0.1，2026-08-20）：单次解锁卡只授予额度、不授予 VIP 身份，
      // 原 promoteToVipInTransaction 调用已删除（该持久化字段无判定消费方，属死语义写入）。
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

// ── 订阅开通 ──────────────────────────────────────────────────────────────────

/**
 * 开通订阅（POST /api/billing/subscribe）：查在售套餐 + 写订阅 + 升 VIP。
 * 套餐以 crm_membership_plans 为唯一事实源（与下单路径 findActivePlan 口径对齐）；
 * 套餐不存在或已下架时返回 null（路由返回 404 PLAN_NOT_FOUND）。
 * 事务封装：createSubscription + promoteToVip 原子执行。
 */
export async function activateSubscription(
  repo: PaymentsRepo,
  membership: MembershipRepo,
  params: { userKey: string; planCode: string },
): Promise<{ planCode: string; price: number; quota: number } | null> {
  const plan = await membership.findPlanByCode(params.planCode);
  if (!plan) return null;
  const conn = await repo.getConnection();
  try {
    await conn.beginTransaction();
    await repo.createSubscriptionInTransaction(conn, params.userKey, params.planCode, plan.duration_days ?? null);
    await repo.promoteToVipInTransaction(conn, params.userKey);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return {
    planCode: params.planCode,
    price: Number(plan.price),
    quota: Math.max(1, Number(plan.unlock_quota || 1)),
  };
}
