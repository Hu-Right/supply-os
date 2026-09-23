/** 支付逆向只按真实订单来源回收新订阅及额度，不推测或复活历史订阅。 */
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { PaymentsRepo } from "../repos/payments.repo";
import type { BenefitFulfillDeps } from "./benefit-grant";

export async function reverseFulfilledOrder(
  payments: PaymentsRepo,
  orderNo: string,
  benefit: BenefitFulfillDeps,
): Promise<{ found: boolean; reversed: boolean; review_required?: boolean }> {
  const conn = await payments.getConnection();
  try {
    await conn.beginTransaction();
    const order = await payments.findOrderForUpdate(conn, orderNo);
    if (!order) { await conn.commit(); return { found: false, reversed: false }; }
    if (order.status !== "paid") { await conn.commit(); return { found: true, reversed: false }; }
    const subscriptionId = await benefit.write.findSubscriptionIdBySourceOrder(conn, orderNo);
    if (subscriptionId === null) throw new Error("REFUND_SUBSCRIPTION_NOT_FOUND");
    const subscription = await benefit.write.findSubscriptionForUpdate(conn, subscriptionId);
    if (!subscription || subscription.owner_user_id !== order.user_id) throw new Error("REFUND_SUBSCRIPTION_MISMATCH");
    const [linked] = await conn.query<RowDataPacket[]>(
      "SELECT order_no FROM crm_payment_orders WHERE original_order_no = ? AND status IN ('pending','paid') LIMIT 1", [orderNo],
    );
    await benefit.write.refundSubscription(conn, subscriptionId);
    // 源单退款时沿替代链冻结后续权益；后续订单的资金处置留人工，不自动退差价或恢复旧池。
    let nextId = subscription.replaced_by_id;
    const seen = new Set([subscriptionId]);
    while (nextId !== null && nextId !== undefined) {
      if (seen.has(nextId)) throw new Error("SUBSCRIPTION_REPLACEMENT_CYCLE");
      seen.add(nextId);
      const next = await benefit.write.findSubscriptionForUpdate(conn, nextId);
      if (!next || next.owner_user_id !== order.user_id) throw new Error("REFUND_SUBSCRIPTION_MISMATCH");
      await benefit.write.freezePoolsOfSubscription(conn, nextId);
      await conn.execute("UPDATE crm_plan_subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status <> 'refunded'", [nextId]);
      nextId = next.replaced_by_id;
    }
    const [updated] = await conn.execute<ResultSetHeader>(
      "UPDATE crm_payment_orders SET status = 'refunded', updated_at = NOW() WHERE order_no = ? AND status = 'paid'", [orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("REFUND_ORDER_CONFLICT");
    await conn.commit();
    if (linked.length || seen.size > 1) {
      console.error(`[refund] 已冻结关联权益，资金链需人工核对：${orderNo}`);
      return { found: true, reversed: false, review_required: true };
    }
    return { found: true, reversed: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
