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
import { LearningMaterialsRepo } from "../repos/learning-materials.repo";
import { getPool } from "../db/pool";
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

      // 学习资料购买：写入 crm_learning_material_purchases 持久化购买记录
      if (order.plan_code.startsWith("material_")) {
        const materialId = order.plan_code.replace(/^material_/, "");
        const lmRepo = new LearningMaterialsRepo(getPool());
        await lmRepo.recordPurchaseInTransaction(conn, order.user_key, materialId, params.orderNo, Number(order.amount));
        await conn.commit();
        return { found: true };
      }

      // 打包套餐购买：从 raw_request 解析 material_ids，批量写入购买记录
      if (order.plan_code.startsWith("bundle_")) {
        let bundleItems: string[] = [];
        try {
          const raw = JSON.parse(order.raw_request || "{}");
          bundleItems = Array.isArray(raw.bundle_items) ? raw.bundle_items : [];
        } catch { /* ignore */ }
        if (bundleItems.length > 0) {
          const lmRepo = new LearningMaterialsRepo(getPool());
          await lmRepo.recordBundlePurchasesInTransaction(conn, order.user_key, bundleItems, params.orderNo, Number(order.amount));
        }
        await conn.commit();
        return { found: true };
      }
      await payments.insertEntitlementInTransaction(conn, {
        userKey: order.user_key,
        orderNo: params.orderNo,
        planCode: order.plan_code,
        quotaTotal: Math.max(1, Number(plan.unlock_quota || 1)),
        durationDays: plan.duration_days ?? null,
      });
      if (plan.plan_type !== "single") {
        await payments.createSubscriptionInTransaction(conn, order.user_key, order.plan_code, plan.duration_days ?? null);
        await payments.promoteToVipInTransaction(conn, order.user_key);
      }
      if (order.notice_id) {
        await payments.upsertNoticeInterestInTransaction(conn, order.user_key, order.notice_id);
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
