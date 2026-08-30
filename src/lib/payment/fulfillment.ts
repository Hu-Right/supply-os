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
import type { PaymentsRepo } from "../repos/payments.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import type { PoolConnection } from "mysql2/promise";
import type { PaymentOrderRow } from "../repos/types";
import { LearningMaterialsRepo } from "../repos/learning-materials.repo";
import { getPool } from "../db/pool";

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

    // 学习资料购买：写入 crm_learning_material_purchases 持久化购买记录
    if (order.plan_code.startsWith("material_")) {
      const materialId = order.plan_code.replace(/^material_/, "");
      const lmRepo = new LearningMaterialsRepo(getPool());
      await lmRepo.recordPurchaseInTransaction(conn, order.user_key, materialId, orderNo, Number(order.amount));
      await conn.commit();
      return;
    }

    // 打包套餐购买：raw_request 中的条目为下单时服务端解析的权威清单；
    // 履约前再按 DB 过滤一次，防止历史订单携带已下架/不存在的条目
    if (order.plan_code.startsWith("bundle_")) {
      let bundleItems: string[] = [];
      try {
        const raw = JSON.parse(order.raw_request || "{}");
        bundleItems = Array.isArray(raw.bundle_items) ? raw.bundle_items : [];
      } catch { /* ignore parse errors */ }

      if (bundleItems.length > 0) {
        const lmRepo = new LearningMaterialsRepo(getPool());
        const existingMaterials = await lmRepo.findByMaterialIds(bundleItems);
        const validIds = existingMaterials.map((m) => m.material_id);
        if (validIds.length > 0) {
          await lmRepo.recordBundlePurchasesInTransaction(conn, order.user_key, validIds, orderNo, Number(order.amount));
        }
      }
      await conn.commit();
      return;
    }

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
// ── 退款逆向回收（审查 F20） ────────────────────────────────────────────────

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

    if (order.plan_code.startsWith("material_") || order.plan_code.startsWith("bundle_")) {
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
