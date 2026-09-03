/**
 * 会员升级履约
 * Membership upgrade fulfillment
 *
 * @module lib/payment/upgrade
 * @description ARCH-P3a（2026-08-31）：从 fulfillment.ts 拆分。
 *              - fulfillUpgradeOrder: 升级订单履约独立入口
 *              - performUpgradeInTransaction: 升级事务内执行（供 activate.ts 复用）
 */
import type { PaymentsRepo } from "../repos/payments.repo";
import type { PoolConnection } from "mysql2/promise";
import type { PaymentOrderRow } from "../repos/types";

/**
 * 在事务内执行会员升级履约（订单已由调用方标记为 paid）
 *
 * 核心规则：
 * - 次数保留：新权益继承原权益的 quota_used
 * - 有效期追溯：新权益继承原权益的 started_at / expires_at
 * - 旧权益标记 is_upgraded = 1（不删除，保留审计链）
 * - 同步变更订阅 plan_code，有效期保持不变
 */
export async function performUpgradeInTransaction(
  conn: PoolConnection,
  paymentsRepo: PaymentsRepo,
  order: PaymentOrderRow,
): Promise<void> {
  const targetPlanCode = order.plan_code;

  const targetPlan = await paymentsRepo.findPlanInTransaction(conn, targetPlanCode);
  if (!targetPlan) return;
  const quotaTotal = Math.max(1, Number(targetPlan.unlock_quota || 1));

  // 查找待升级的原权益（最高价、非目标套餐，悲观锁防并发）
  const original = await paymentsRepo.findBestEntitlementForUpgradeInTransaction(
    conn, order.user_id!, targetPlanCode,
  );

  // 差价快照校验（审查 F23）：下单时记录的目标套餐价/当前权益价与履约时
  // 实际值发生漂移（运营调价、权益到期、并发下单）→ 差价与承接权益失配，
  // 拒绝自动履约（事务回滚、订单保持 pending、告警转人工退款）。
  // 修复前的存量订单无快照字段，跳过校验保持向后兼容。
  let snapshot: { target_price?: number; current_price?: number } | null = null;
  try {
    const raw = JSON.parse(order.raw_request || "{}");
    if (raw.upgrade_snapshot && typeof raw.upgrade_snapshot === "object") {
      snapshot = raw.upgrade_snapshot;
    }
  } catch { /* raw_request 损坏时视为无快照 */ }

  if (snapshot) {
    const drift: string[] = [];
    const targetPrice = Number(targetPlan.price);
    if (snapshot.target_price !== undefined
      && Math.abs(targetPrice - Number(snapshot.target_price)) > 0.01) {
      drift.push(`target_price ${snapshot.target_price}→${targetPrice}`);
    }
    if (snapshot.current_price !== undefined && original
      && Math.abs(Number(original.price ?? 0) - Number(snapshot.current_price)) > 0.01) {
      drift.push(`current_price ${snapshot.current_price}→${original.price}`);
    }
    if (drift.length > 0) {
      console.error(
        `[upgrade] 差价快照校验失败（${drift.join("; ")}），转人工核处: order_no=${order.order_no}`,
      );
      throw new Error("UPGRADE_PRICE_DRIFT");
    }
  }

  if (original) {
    // 标记旧权益已升级（quota_used 保留供审计）
    await paymentsRepo.markEntitlementUpgradedInTransaction(conn, original.id);
    // 发放新权益：继承 quota_used（次数保留）+ started_at/expires_at（有效期追溯）
    await paymentsRepo.insertUpgradedEntitlementInTransaction(conn, {
      userId: order.user_id!,
      orderNo: order.order_no,
      planCode: targetPlanCode,
      quotaTotal,
      quotaUsed: Number(original.quota_used || 0),
      upgradedFromEntitlementId: original.id,
      startedAt: original.started_at,
      expiresAt: original.expires_at,
    });
  } else {
    // 仅订阅场景（无可升级权益）：直接发放新权益，使用次数从 0 计，有效期按目标套餐时长
    const now = new Date();
    const fallbackExpires = targetPlan.duration_days
      ? new Date(now.getTime() + Number(targetPlan.duration_days) * 86400000)
      : null;
    await paymentsRepo.insertUpgradedEntitlementInTransaction(conn, {
      userId: order.user_id!,
      orderNo: order.order_no,
      planCode: targetPlanCode,
      quotaTotal,
      quotaUsed: 0,
      upgradedFromEntitlementId: null,
      startedAt: now,
      expiresAt: fallbackExpires,
    });
  }

  // 同步变更订阅 plan_code（最新一条非目标套餐的活跃订阅），有效期不变
  const sub = await paymentsRepo.findUpgradeableSubscriptionInTransaction(conn, order.user_id!, targetPlanCode);
  if (sub) {
    await paymentsRepo.updateSubscriptionPlanInTransaction(conn, sub.id, targetPlanCode);
  }

  await paymentsRepo.promoteToVipInTransaction(conn, order.user_id!);
}

/**
 * 会员升级履约独立事务入口（mock 支付 / 手动补发路径）
 * 悲观锁 + 幂等保护 + 升级发放
 */
export async function fulfillUpgradeOrder(
  paymentsRepo: PaymentsRepo,
  orderNo: string,
  providerTradeNo?: string,
): Promise<void> {
  const conn = await paymentsRepo.getConnection();
  try {
    await conn.beginTransaction();
    const order = await paymentsRepo.findOrderForUpdate(conn, orderNo);
    if (!order) { await conn.commit(); return; }
    if (order.status === "paid") { await conn.commit(); return; }
    await paymentsRepo.markAsPaidInTransaction(conn, orderNo, providerTradeNo || null);
    await performUpgradeInTransaction(conn, paymentsRepo, order);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
