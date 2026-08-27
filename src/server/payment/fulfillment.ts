/**
 * 支付履约（权益发放）
 * Payment fulfillment: entitlement granting
 *
 * @module server/payment/fulfillment
 * @description 统一履约入口：
 *              - activatePaidOrder: 真实支付回调履约（事务版，悲观锁）
 *              - fulfillMockPayment: mock 支付履约（非事务）
 *              - activateSubscription: 订阅开通（套餐以 crm_membership_plans 为唯一事实源）
 */
import "server-only";
import type { PaymentsRepo } from "../repos/payments.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import type { PoolConnection } from "mysql2/promise";
import type { PaymentOrderRow } from "../repos/types";

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

// ── 会员升级履约 ──────────────────────────────────────────────────────────────

/**
 * 在事务内执行会员升级履约（订单已由调用方标记为 paid）
 *
 * 核心规则：
 * - 次数保留：新权益继承原权益的 quota_used
 * - 有效期追溯：新权益继承原权益的 started_at / expires_at
 * - 旧权益标记 is_upgraded = 1（不删除，保留审计链）
 * - 同步变更订阅 plan_code，有效期保持不变
 */
async function performUpgradeInTransaction(
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
    conn, order.user_key, targetPlanCode,
  );

  if (original) {
    // 标记旧权益已升级（quota_used 保留供审计）
    await paymentsRepo.markEntitlementUpgradedInTransaction(conn, original.id);
    // 发放新权益：继承 quota_used（次数保留）+ started_at/expires_at（有效期追溯）
    await paymentsRepo.insertUpgradedEntitlementInTransaction(conn, {
      userKey: order.user_key,
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
      userKey: order.user_key,
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
  const sub = await paymentsRepo.findUpgradeableSubscriptionInTransaction(conn, order.user_key, targetPlanCode);
  if (sub) {
    await paymentsRepo.updateSubscriptionPlanInTransaction(conn, sub.id, targetPlanCode);
  }

  await paymentsRepo.promoteToVipInTransaction(conn, order.user_key);
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

// ── Mock 支付履约 ─────────────────────────────────────────────────────────────

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
  if (order.status !== "paid") {
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
  }
  return { found: true };
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
