/**
 * 退款逆向回收
 * Refund reversal
 *
 * @module lib/payment/reverse
 * @description ARCH-P3a（2026-08-31）：从 fulfillment.ts 拆分。
 *              - reverseFulfilledOrder: 全额退款/交易关闭后逆向回收已发放权益
 */
import type { PaymentsRepo } from "../repos/payments.repo";

/**
 * 全额退款/交易关闭（TRADE_CLOSED）后按订单类型逆向回收已发放权益：
 * - 学习资料（material_/bundle_）：删除 crm_learning_material_purchases 购买记录
 * - 会员套餐（single/bundle/subscription 新购）：权益 status→refunded、
 *   订阅 status→refunded，无其他活跃订阅时 membership_tier 降级 free
 * - 升级订单（upgrade）：差价链路复杂，仅标记 refunded 并告警转人工
 * 幂等：仅 paid 订单可逆向，重复通知无副作用。
 */
export async function reverseFulfilledOrder(
  paymentsRepo: PaymentsRepo,
  orderNo: string,
): Promise<{ found: boolean; reversed: boolean }> {
  const conn = await paymentsRepo.getConnection();
  try {
    await conn.beginTransaction();

    const order = await paymentsRepo.findOrderForUpdate(conn, orderNo);
    if (!order) {
      await conn.commit();
      return { found: false, reversed: false };
    }
    // 幂等 + 状态机：只有 paid 订单存在已发放权益可回收
    if (order.status !== "paid") {
      await conn.commit();
      return { found: true, reversed: false };
    }

    const [flagResult] = await conn.execute(
      "UPDATE crm_payment_orders SET status = 'refunded', updated_at = NOW() WHERE order_no = ? AND status = 'paid'",
      [orderNo],
    );
    if ((flagResult as { affectedRows?: number }).affectedRows === 0) {
      await conn.commit();
      return { found: true, reversed: false };
    }

    // 抵扣关联护栏（2026-08-30 首单抵扣配套）：本单退款若已被其他已支付订单
    // 通过 original_order_no 引用（single_99 已被拿去抵扣 annual_799 且会员已
    // 发货），自动回收会留下"退回 99 元、700 元会员照常保有"的套利口子——
    // 不回收权益，标记 refunded 并告警转人工核处
    const [linkedRows] = await conn.query(
      "SELECT order_no FROM crm_payment_orders WHERE original_order_no = ? AND status = 'paid' LIMIT 1",
      [orderNo],
    );
    const linkedOrder = (linkedRows as Array<{ order_no: string }>)[0];
    if (linkedOrder) {
      await conn.commit();
      console.error(
        `[refund] 订单已被抵扣引用（linked_order_no=${linkedOrder.order_no}），权益保留转人工核处: order_no=${orderNo}`,
      );
      return { found: true, reversed: false };
    }

    if (order.plan_code.startsWith("material_") || order.plan_code.startsWith("bundle_")) {
      // ARCH-B+（2026-09-01）：学习资料订单已拆分至 learning_orders 表，
      // 退款由 LearningPaymentService.reverseOrder 独立处理。
      // 此处仅回滚 crm_payment_orders 中的历史数据（向后兼容）。
      await conn.execute(
        "DELETE FROM crm_learning_material_purchases WHERE order_no = ? AND user_key = ?",
        [orderNo, order.user_key],
      );
    } else if (order.order_type === "upgrade") {
      // 升级订单承接链复杂（补差价/次数保留/有效期追溯），不自动回滚：
      // 订单已标记 refunded，权益保留并告警转人工核处
      console.error(
        `[refund] 升级订单退款需人工核处: order_no=${orderNo}, user_key=${order.user_key}`,
      );
    } else {
      await conn.execute(
        "UPDATE crm_user_entitlements SET status = 'refunded', updated_at = NOW() WHERE source_order_no = ? AND status = 'active'",
        [orderNo],
      );
      // 订阅表无 source_order_no：按用户+套餐回退最近一份活跃订阅
      await conn.execute(
        "UPDATE crm_user_subscriptions SET status = 'refunded' WHERE user_key = ? AND plan_code = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
        [order.user_key, order.plan_code],
      );
      // 无其他活跃订阅则降级会员等级
      await conn.execute(
        `UPDATE crm_users u SET u.membership_tier = 'free'
         WHERE u.user_key = ?
           AND NOT EXISTS (
             SELECT 1 FROM crm_user_subscriptions s
             WHERE s.user_key = u.user_key AND s.status = 'active'
               AND (s.expires_at IS NULL OR s.expires_at > NOW())
           )`,
        [order.user_key],
      );
    }

    await conn.commit();
    console.log(`[refund] 订单退款逆向完成: order_no=${orderNo}, plan=${order.plan_code}`);
    return { found: true, reversed: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
