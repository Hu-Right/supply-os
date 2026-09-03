/**
 * Mock 支付履约
 * Mock payment fulfillment
 *
 * @module lib/payment/mock
 * @description ARCH-P3a（2026-08-31）：从 fulfillment.ts 拆分。
 *              - fulfillMockPayment: mock 支付履约（POST /api/payments/:orderNo/mock-paid）
 */
import type { PaymentsRepo } from "../repos/payments.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import { fulfillUpgradeOrder } from "./upgrade";

/**
 * mock 支付履约（POST /api/payments/:orderNo/mock-paid）：
 * 已 paid 幂等返回；否则按套餐发放额度、非单次套餐写订阅并升 VIP、
 * 绑定公告时记录订阅兴趣。事务封装保证原子性。
 */
export async function fulfillMockPayment(
  payments: PaymentsRepo,
  membership: MembershipRepo,
  params: { orderNo: string; rawNotify: string },
): Promise<{ found: boolean }> {
  const order = await payments.findByOrderNo(params.orderNo);
  if (!order) return { found: false };
  // 状态机白名单（审查 F19）：仅 pending 订单可 mock 履约
  if (order.status !== "pending") {
    return { found: true };
  }
  // 升级订单走平滑升级履约（补差价，次数保留，有效期追溯）
  if (order.order_type === "upgrade") {
    await fulfillUpgradeOrder(payments, params.orderNo, `MOCK-${params.orderNo}`);
    return { found: true };
  }
    const plan = (await membership.findPlanByCodeForFulfillment(order.plan_code))
      ?? { unlock_quota: 1, duration_days: null as number | null, plan_type: "single" as string };

    // 事务封装：markAsMockPaid + insertEntitlement + createSubscription + promoteToVip + upsertNoticeInterest
    const conn = await payments.getConnection();
    try {
      await conn.beginTransaction();
      await payments.markAsMockPaidInTransaction(conn, params.orderNo, params.rawNotify);

      // ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单已拆分至 learning_orders 表，
      // 由 LearningPaymentService.fulfillMockOrder 独立履约。

      await payments.insertEntitlementInTransaction(conn, {
        userId: order.user_id!,
        orderNo: params.orderNo,
        planCode: order.plan_code,
        quotaTotal: Math.max(1, Number(plan.unlock_quota || 1)),
        durationDays: plan.duration_days ?? null,
      });
      if (plan.plan_type !== "single") {
        await payments.createSubscriptionInTransaction(conn, order.user_id!, order.plan_code, plan.duration_days ?? null);
        await payments.promoteToVipInTransaction(conn, order.user_id!);
      }
      if (order.notice_id) {
        await payments.upsertNoticeInterestInTransaction(conn, order.user_id!, order.notice_id);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  return { found: true };
}
