/**
 * 支付履约（权益发放）
 * Payment fulfillment: transaction-based entitlement granting
 *
 * @module server/payment/fulfillment
 */
import type { PaymentsRepo } from "../repos/payments.repo";

/**
 * 激活已支付订单（事务封装：悲观锁 + 幂等 + 权益发放）
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
