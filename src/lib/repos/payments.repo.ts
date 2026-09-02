/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 支付订单数据访问层
 * Payments Repository
 *
 * @module repos/payments.repo
 * @description ARCH-P4b（2026-09-01）：查询视图方法（countOrders/listOrders/
 *              countUnlocks/listUnlocks/upsertNoticeTranslation）已拆至
 *              payment-history.repo.ts。本 Repo 聚焦订单 CRUD + 履约事务。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { MembershipPlanRow, PaymentOrderRow } from "./types";

// 向后兼容：历史查询类型 re-export（新代码应从 payment-history.repo 导入）
export type { OrderHistoryRow, UnlockHistoryRow } from "./payment-history.repo";

/** 支付渠道配置行（config-status 展示用） */
export interface PaymentProviderConfigRow {
  provider: string;
  mode: string;
  app_id: string | null;
  merchant_id: string | null;
  notify_url: string | null;
  is_active: number;
}

export class PaymentsRepo {
  constructor(private pool: Pool) {}

  /** 获取数据库连接（事务场景使用） */
  getConnection(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** 按订单号查询订单 */
  async findByOrderNo(orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, user_key, provider, plan_code, order_type, original_order_no, amount, currency, status, notice_id,
              provider_trade_no, pay_url, paid_at, created_at, updated_at, raw_request, raw_notify
       FROM crm_payment_orders WHERE order_no = ? LIMIT 1`,
      [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  /** 查找用户待支付订单（同 plan + provider + notice 组合） */
  async findPendingOrder(params: {
    userKey: string;
    planCode: string;
    provider: string;
    noticeId: number | null;
  }): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, provider, plan_code, amount, currency, status, notice_id, pay_url, qr_code_url
       FROM crm_payment_orders
       WHERE user_key = ? AND plan_code = ? AND provider = ? AND status = 'pending' AND (notice_id <=> ?)
       ORDER BY id DESC LIMIT 1`,
      [params.userKey, params.planCode, params.provider, params.noticeId],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  /** 创建支付订单 */
  async createOrder(data: {
    userKey: string;
    orderNo: string;
    provider: string;
    planCode: string;
    noticeId: number | null;
    amount: number;
    currency: string;
    payUrl: string | null;
    qrCodeUrl: string | null;
    rawRequest: string;
    /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
    orderType?: string;
    /** 升级订单关联的原订单号 */
    originalOrderNo?: string | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_payment_orders
        (user_id, order_no, user_key, provider, plan_code, order_type, original_order_no, notice_id, amount, currency, status, pay_url, qr_code_url, raw_request, created_at)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())`,
      [
        data.userKey, data.orderNo, data.userKey, data.provider, data.planCode,
        data.orderType || "new", data.originalOrderNo ?? null,
        data.noticeId, data.amount, data.currency, data.payUrl, data.qrCodeUrl, data.rawRequest,
      ],
    );
  }

  /** 更新待支付订单（复用已有订单号） */
  async updatePendingOrder(orderNo: string, data: {
    amount: number;
    currency: string;
    payUrl: string | null;
    qrCodeUrl: string | null;
    rawRequest: string;
  }): Promise<void> {
    await this.pool.execute(
      `UPDATE crm_payment_orders
       SET amount = ?, currency = ?, pay_url = ?, qr_code_url = ?, raw_request = ?, updated_at = NOW()
       WHERE order_no = ? AND status = 'pending'`,
      [data.amount, data.currency, data.payUrl, data.qrCodeUrl, data.rawRequest, orderNo],
    );
  }

  /** 标记订单为已支付 */
  async markAsPaid(orderNo: string, providerTradeNo: string | null): Promise<void> {
    await this.pool.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
       WHERE order_no = ?`,
      [providerTradeNo, orderNo],
    );
  }

  /** 创建用户订阅（days 为 null 时不过期） */
  async createSubscription(userKey: string, planCode: string, days: number | null): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_subscriptions (user_id, user_key, plan_code, status, started_at, expires_at)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW(), ${days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"})`,
      days ? [userKey, userKey, planCode, days] : [userKey, userKey, planCode],
    );
  }

  /** 提升用户为 VIP */
  async promoteToVip(userKey: string): Promise<void> {
    await this.pool.execute("UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?", [userKey]);
  }

  /** 发放解锁额度（days 为 null 时不过期） */
  async insertEntitlement(params: {
    userKey: string;
    orderNo: string;
    planCode: string;
    quotaTotal: number;
    durationDays: number | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_entitlements
        (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at, expires_at, status)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW(), ${params.durationDays ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"}, 'active')`,
      params.durationDays
        ? [params.userKey, params.userKey, params.orderNo, params.planCode, params.quotaTotal, params.durationDays]
        : [params.userKey, params.userKey, params.orderNo, params.planCode, params.quotaTotal],
    );
  }

  /** 记录支付带来的公告订阅（幂等 upsert） */
  async upsertNoticeInterest(userKey: string, noticeId: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'subscribed', 'payment')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
      [userKey, userKey, noticeId],
    );
  }

  /** mock 支付落库（覆写交易号与原始通知体） */
  async markAsMockPaid(orderNo: string, rawNotify: string): Promise<void> {
    await this.pool.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
       WHERE order_no = ?`,
      [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
  }

  /** 查询活跃支付渠道配置（config-status 展示用） */
  async listActiveProviderConfigs(): Promise<PaymentProviderConfigRow[]> {
    const [rows] = await this.pool.query(
      `SELECT provider, mode, app_id, merchant_id, notify_url, is_active
       FROM crm_payment_provider_configs
       WHERE is_active = 1
       ORDER BY provider, id DESC`,
    );
    return rows as PaymentProviderConfigRow[];
  }

  // ── 事务支持方法（接受 PoolConnection 用于 activatePaidOrder 事务）──

  /** 查询活跃计划详情 */
  async findActivePlan(planCode: string): Promise<MembershipPlanRow | null> {
    const [rows] = await this.pool.query(
      `SELECT plan_code, name, price, currency, unlock_quota, duration_days, plan_type
       FROM crm_membership_plans WHERE plan_code = ? AND is_active = 1 LIMIT 1`,
      [planCode],
    );
    return (rows as MembershipPlanRow[])[0] ?? null;
  }

  /** 悲观锁查询订单（事务内使用） */
  async findOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await conn.query(
      "SELECT user_key, plan_code, order_type, original_order_no, notice_id, amount, status FROM crm_payment_orders WHERE order_no = ? LIMIT 1 FOR UPDATE",
      [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  /** 事务内标记订单已支付（仅 pending 可流转，防止 closed/refunded 被复活，审查 F19） */
  async markAsPaidInTransaction(conn: PoolConnection, orderNo: string, providerTradeNo: string | null): Promise<void> {
    await conn.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no), paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
       WHERE order_no = ? AND status = 'pending'`,
      [providerTradeNo, orderNo],
    );
  }

  /** 事务内查询计划详情 */
  async findPlanInTransaction(conn: PoolConnection, planCode: string): Promise<MembershipPlanRow | null> {
    const [rows] = await conn.query(
      "SELECT plan_code, unlock_quota, duration_days, plan_type FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
      [planCode],
    );
    return (rows as MembershipPlanRow[])[0] ?? null;
  }

  /** 检查是否已有来自该订单的权益（事务内） */
  async hasEntitlementForOrder(conn: PoolConnection, orderNo: string): Promise<boolean> {
    const [rows] = await conn.query(
      "SELECT id FROM crm_user_entitlements WHERE source_order_no = ? LIMIT 1",
      [orderNo],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 事务内创建订阅 */
  async createSubscriptionInTransaction(conn: PoolConnection, userKey: string, planCode: string, days: number | null): Promise<void> {
    await conn.execute(
      `INSERT INTO crm_user_subscriptions
        (user_id, user_key, plan_code, status, started_at${days ? ", expires_at" : ""})
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW()${days ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""})`,
      days ? [userKey, userKey, planCode, days] : [userKey, userKey, planCode],
    );
  }

  /** 事务内发放权益 */
  async insertEntitlementInTransaction(conn: PoolConnection, params: {
    userKey: string; orderNo: string; planCode: string; quotaTotal: number; durationDays: number | null;
  }): Promise<void> {
    await conn.execute(
      `INSERT INTO crm_user_entitlements
        (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at${params.durationDays ? ", expires_at" : ""}, status)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW()${params.durationDays ? ", DATE_ADD(NOW(), INTERVAL ? DAY)" : ""}, 'active')`,
      params.durationDays
        ? [params.userKey, params.userKey, params.orderNo, params.planCode, params.quotaTotal, params.durationDays]
        : [params.userKey, params.userKey, params.orderNo, params.planCode, params.quotaTotal],
    );
  }

  /** 事务内提升 VIP */
  async promoteToVipInTransaction(conn: PoolConnection, userKey: string): Promise<void> {
    await conn.execute(
      "UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?",
      [userKey],
    );
  }

  /** 事务内 mock 支付落库 */
  async markAsMockPaidInTransaction(conn: PoolConnection, orderNo: string, rawNotify: string): Promise<void> {
    await conn.execute(
      `UPDATE crm_payment_orders
       SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
       WHERE order_no = ?`,
      [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
  }

  /** 事务内记录公告订阅兴趣 */
  async upsertNoticeInterestInTransaction(conn: PoolConnection, userKey: string, noticeId: number): Promise<void> {
    await conn.execute(
      `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'subscribed', 'payment')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
      [userKey, userKey, noticeId],
    );
  }

  // ── 套餐升级事务方法（供 fulfillUpgradeOrder 使用）──

  /** 事务内标记旧权益已被升级替代（保留 quota_used 供审计追溯） */
  async markEntitlementUpgradedInTransaction(conn: PoolConnection, entitlementId: number): Promise<void> {
    await conn.execute(
      "UPDATE crm_user_entitlements SET is_upgraded = 1, updated_at = NOW() WHERE id = ?",
      [entitlementId],
    );
  }

  /**
   * 事务内发放升级后的新权益
   * 继承原权益的 quota_used（次数保留）与 started_at/expires_at（有效期追溯）
   */
  async insertUpgradedEntitlementInTransaction(conn: PoolConnection, params: {
    userKey: string;
    orderNo: string;
    planCode: string;
    quotaTotal: number;
    quotaUsed: number;
    upgradedFromEntitlementId: number | null;
    startedAt: Date | null;
    expiresAt: Date | null;
  }): Promise<void> {
    await conn.execute(
      `INSERT INTO crm_user_entitlements
        (user_id, user_key, source_order_no, upgraded_from_entitlement_id, plan_code,
         quota_total, quota_used, started_at, expires_at, status)
       VALUES (
         (SELECT id FROM crm_users WHERE user_key = ? LIMIT 1),
         ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        params.userKey, params.userKey, params.orderNo, params.upgradedFromEntitlementId,
        params.planCode, params.quotaTotal, params.quotaUsed,
        params.startedAt || new Date(), params.expiresAt,
      ],
    );
  }

  /** 事务内变更订阅的套餐（升级后 plan_code 指向新套餐，有效期不变） */
  async updateSubscriptionPlanInTransaction(conn: PoolConnection, subscriptionId: number, newPlanCode: string): Promise<void> {
    await conn.execute(
      "UPDATE crm_user_subscriptions SET plan_code = ? WHERE id = ?",
      [newPlanCode, subscriptionId],
    );
  }

  /**
   * 事务内悲观锁查询待升级的原权益
   * 取用户当前最高价、非目标套餐、未被升级的活跃权益（锁定防并发重复升级）
   */
  async findBestEntitlementForUpgradeInTransaction(
    conn: PoolConnection,
    userKey: string,
    targetPlanCode: string,
  ): Promise<{ id: number; plan_code: string; price: number; quota_used: number; started_at: Date; expires_at: Date | null } | null> {
    const [rows] = await conn.query(
      `SELECT e.id, e.plan_code, p.price, e.quota_used, e.started_at, e.expires_at
       FROM crm_user_entitlements e
       INNER JOIN crm_membership_plans p ON p.plan_code = e.plan_code
       WHERE e.user_key = ? AND e.status = 'active' AND e.is_upgraded = 0
         AND e.plan_code <> ?
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
       ORDER BY p.price DESC, e.id DESC
       LIMIT 1
       FOR UPDATE`,
      [userKey, targetPlanCode],
    );
    return (rows as RowDataPacket[])[0] as { id: number; plan_code: string; price: number; quota_used: number; started_at: Date; expires_at: Date | null } ?? null;
  }

  /** 事务内查询用户可升级的活跃订阅（最新一条非目标套餐的活跃订阅） */
  async findUpgradeableSubscriptionInTransaction(
    conn: PoolConnection,
    userKey: string,
    targetPlanCode: string,
  ): Promise<{ id: number } | null> {
    const [rows] = await conn.query(
      `SELECT id FROM crm_user_subscriptions
       WHERE user_key = ? AND status = 'active' AND plan_code <> ?
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC LIMIT 1`,
      [userKey, targetPlanCode],
    );
    return (rows as RowDataPacket[])[0] as { id: number } ?? null;
  }

  /** 查询订单金额（回调金额校验用） */
  async findOrderAmount(orderNo: string): Promise<{ amount: number; status: string } | null> {
    const [rows] = await this.pool.query(
      "SELECT amount, status FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { amount: Number(row.amount || 0), status: row.status } : null;
  }

  /**
   * 首单特惠资格检查：用户是否从未购买过任何单次解锁（single_* 系列）。
   *
   * 业务规则（产品决策 2026-08-30）：
   * - 匹配所有 single_* 套餐（不限 single_99）
   * - pending 也计入——防止"先开单不付款再开第二单"绕过首单限制
   * - 用于首单特惠资格判定和前端套餐列表展示
   */
  async hasSingleUnlockRecord(userKey: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 FROM crm_payment_orders WHERE user_key = ? AND plan_code LIKE 'single_%' AND status IN ('pending','paid') LIMIT 1",
      [userKey],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /**
   * 可抵扣的 single_99 源订单查找（首单特惠抵扣逻辑）。
   *
   * 业务规则（产品决策 2026-08-30）：
   * - 仅限 single_99 套餐（single_199 历史买家不参与抵扣）
   * - 已支付且 paid_at 在 7 天内（抵扣窗口期）
   * - 未被任何非 closed 订单通过 original_order_no 引用过（一单只能抵扣一次）
   * - 用于首单特惠升级时的金额抵扣计算
   */
  async findDeductibleSingleOrder(userKey: string): Promise<{ order_no: string; amount: number; paid_at: Date } | null> {
    const [rows] = await this.pool.query(
      `SELECT o.order_no, o.amount, o.paid_at
       FROM crm_payment_orders o
       WHERE o.user_key = ? AND o.plan_code = 'single_99' AND o.status = 'paid'
         AND o.paid_at >= NOW() - INTERVAL 7 DAY
         AND NOT EXISTS (
           SELECT 1 FROM crm_payment_orders o2
           WHERE o2.original_order_no = o.order_no AND o2.status <> 'closed'
         )
       ORDER BY o.paid_at DESC
       LIMIT 1`,
      [userKey],
    );
    const row = (rows as RowDataPacket[])[0];
    return row
      ? { order_no: row.order_no as string, amount: Number(row.amount || 0), paid_at: row.paid_at as Date }
      : null;
  }
}
