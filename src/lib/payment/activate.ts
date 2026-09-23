/** 会员真实支付、查询补偿和 Mock 共用的履约事务。 */
import type { PaymentsRepo } from "../repos/payments.repo";
import { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { grantSubscriptionForPlan, type BenefitFulfillDeps } from "./benefit-grant";
import { performUpgradeInTransaction } from "./upgrade";

export async function activatePaidOrder(
  payments: PaymentsRepo,
  orderNo: string,
  providerTradeNo: string | undefined,
  benefit: BenefitFulfillDeps,
  mockNotify?: string,
): Promise<boolean> {
  const conn = await payments.getConnection();
  try {
    await conn.beginTransaction();
    const order = await payments.findOrderForUpdate(conn, orderNo);
    if (!order) { await conn.commit(); return false; }
    if (order.status !== "pending") { await conn.commit(); return true; }
    if (mockNotify !== undefined && order.provider !== "mock") throw new Error("MOCK_PROVIDER_REQUIRED");
    if (await benefit.write.findSubscriptionIdBySourceOrder(conn, orderNo) !== null) {
      throw new Error("ORDER_FULFILLMENT_CONFLICT");
    }
    // 目录和矩阵必须也使用此事务连接，避免发放途中混读不同版本。
    const deps = { catalog: new BenefitSystemRepo(conn), write: benefit.write };
    if (order.order_type === "upgrade") {
      await performUpgradeInTransaction(conn, deps, order);
    } else {
      await grantSubscriptionForPlan(deps, conn, {
        userId: order.user_id!, orderNo, planCode: order.plan_code,
        pricePaid: Number(order.amount), currency: order.currency,
      });
    }
    if (mockNotify !== undefined) {
      await payments.markAsMockPaidInTransaction(conn, orderNo, mockNotify);
    } else {
      await payments.markAsPaidInTransaction(conn, orderNo, providerTradeNo ?? null);
    }
    if (order.notice_id) await payments.upsertNoticeInterestInTransaction(conn, order.user_id!, order.notice_id);
    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
