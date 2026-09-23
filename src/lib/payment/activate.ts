/**
 * 真实支付履约
 * Real payment fulfillment
 *
 * @module lib/payment/activate
 * @description ARCH-P3a（2026-08-31）：从 fulfillment.ts 拆分。
 *              activatePaidOrder: 真实支付回调履约（事务版，悲观锁）。
 *              V2 权益（2026-09-21）：activateSubscription 随 /api/billing/subscribe
 *              路由的消亡一并删除（新套餐体系只有支付下单一条履约路径）。
 *              权益体系双轨（2026-09-23）：传入 benefitDeps 后，plan_code 命中新目录
 *              （crm_plan_catalog）的订单一律走新表组履约（订阅事实+席位+按矩阵开池），
 *              未命中者继续旧三表路径；新旧码集合不相交，一单只落一本账，不是双写。
 */
import type { PaymentsRepo } from "../repos/payments.repo";
import { performUpgradeInTransaction } from "./upgrade";
import { grantSubscriptionForPlan, type BenefitFulfillDeps } from "./benefit-grant";

// ── 真实支付回调履约（事务版） ────────────────────────────────────────────────

/**
 * 激活已支付订单（事务封装：悲观锁 + 幂等 + 权益发放）
 * 用于真实支付回调（支付宝/微信异步通知）
 */
export async function activatePaidOrder(
  paymentsRepo: PaymentsRepo,
  orderNo: string,
  providerTradeNo?: string,
  benefit?: BenefitFulfillDeps,
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

    // 权益体系双轨（阶段二）：新目录码只走新表组履约，绝不碰旧三表。
    // 失败一律抛出回滚（订单留在 pending、回调报 failure 供平台重试/告警），
    // "订单置 paid 但不履约"是旧体系的病根，新链路不沿袭 silent-commit。
    if (benefit) {
      const newPlan = await benefit.catalog.getPlan(order.plan_code);
      if (newPlan) {
        if (order.order_type === "upgrade") {
          // 新体系的升级承接（linkReplacedSubscription）尚未接入选款：新目录码的
          // 升级单只可能来自未来收银台扩容忘了同步本闸口——抛错显眼优于拿旧链补差
          throw new Error(`UPGRADE_ON_NEW_CATALOG_NOT_WIRED: ${orderNo} (${order.plan_code})`);
        }
        await grantSubscriptionForPlan(benefit, conn, {
          userId: order.user_id!,
          orderNo,
          planCode: order.plan_code,
          pricePaid: Number(order.amount || 0),
        });
        await conn.commit();
        return;
      }
    }

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
        userId: order.user_id!,
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
      conn, order.user_id!, order.plan_code, plan.duration_days,
    );

    await paymentsRepo.insertEntitlementInTransaction(conn, {
      userId: order.user_id!,
      orderNo,
      planCode: order.plan_code,
      quotaTotal: Number(plan.unlock_quota || 1),
      durationDays: plan.duration_days,
    });

    await paymentsRepo.promoteToVipInTransaction(conn, order.user_id!);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
