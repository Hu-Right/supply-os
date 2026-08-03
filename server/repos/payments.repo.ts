/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 支付订单数据访问层
 * Payments Repository
 *
 * @module repos/payments.repo
 */
import type { Pool } from "mysql2/promise";
import type { MembershipPlanRow, PaymentOrderRow } from "./types";

/** 订单历史查询行（订单 LEFT JOIN 公告，供列表映射） */
export interface OrderHistoryRow extends PaymentOrderRow {
  external_notice_id: string | null;
  source_channel: string | null;
  reference: string | null;
  title: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  urgency: string | null;
  url: string | null;
  industry: string | null;
}

/** 解锁历史查询行（解锁 LEFT JOIN 公告 [+ 译文]，供列表映射与后台补翻） */
export interface UnlockHistoryRow {
  user_key: string;
  notice_id: number | null;
  unlock_type: string;
  price: number;
  unlocked_at: Date;
  external_notice_id: string | null;
  source_channel: string | null;
  reference: string | null;
  title: string | null;
  title_i18n?: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  urgency: string | null;
  url: string | null;
  industry: string | null;
  description?: string | null;
}

export class PaymentsRepo {
  constructor(private pool: Pool) {}

  /** 按订单号查询订单 */
  async findByOrderNo(orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, user_key, provider, plan_code, amount, currency, status, notice_id,
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
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_payment_orders
        (user_id, order_no, user_key, provider, plan_code, notice_id, amount, currency, status, pay_url, qr_code_url, raw_request, created_at)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())`,
      [
        data.userKey, data.orderNo, data.userKey, data.provider, data.planCode,
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

  /** 订单历史总数（可选状态过滤） */
  async countOrders(userKey: string, status: string): Promise<number> {
    const params: any[] = [userKey];
    let where = "WHERE o.user_key = ?";
    if (status) {
      where += " AND o.status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM crm_payment_orders o
       ${where}`,
      params,
    );
    return Number((rows as any[])[0]?.total || 0);
  }

  /** 订单历史分页（订单 LEFT JOIN 公告摘要） */
  async listOrders(userKey: string, status: string, limit: number, offset: number): Promise<OrderHistoryRow[]> {
    const params: any[] = [userKey];
    let where = "WHERE o.user_key = ?";
    if (status) {
      where += " AND o.status = ?";
      params.push(status);
    }
    params.push(limit, offset);
    const [rows] = await this.pool.query(
      `SELECT
         o.order_no, o.user_key, o.provider, o.plan_code, o.notice_id, o.amount, o.currency,
         o.status, o.provider_trade_no, o.paid_at, o.created_at, o.updated_at,
         n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
         n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.urgency, n.url, n.industry
       FROM crm_payment_orders o
       LEFT JOIN crm_bid_notices n ON n.id = o.notice_id
       ${where}
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows as OrderHistoryRow[];
  }

  /** 解锁历史总数（仅公告解锁） */
  async countUnlocks(userKey: string): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM crm_opportunity_unlocks u
       WHERE u.user_key = ? AND u.notice_id IS NOT NULL`,
      [userKey],
    );
    return Number((rows as any[])[0]?.total || 0);
  }

  /**
   * 解锁历史分页（解锁 LEFT JOIN 公告 [+ 译文]）。
   * withTranslation 为 true 时多取 n.description（仅供后台补翻用，不返回）与缓存译文标题。
   */
  async listUnlocks(
    userKey: string,
    limit: number,
    offset: number,
    withTranslation: { lang: string } | null,
  ): Promise<UnlockHistoryRow[]> {
    const [rows] = await this.pool.query(
      withTranslation
        ? `SELECT
             u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry,
             n.description, tr.title_tr AS title_i18n
           FROM crm_opportunity_unlocks u
           LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
           LEFT JOIN crm_notice_translations tr ON tr.notice_id = u.notice_id AND tr.lang = ?
           WHERE u.user_key = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`
        : `SELECT
             u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry
           FROM crm_opportunity_unlocks u
           LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
           WHERE u.user_key = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`,
      withTranslation ? [withTranslation.lang, userKey, limit, offset] : [userKey, limit, offset],
    );
    return rows as UnlockHistoryRow[];
  }

  /** 公告译文缓存 upsert（后台补翻落库） */
  async upsertNoticeTranslation(noticeId: number, lang: string, titleTr: string, descriptionTr: string, model: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [noticeId, lang, titleTr, descriptionTr, model],
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
  async listActiveProviderConfigs(): Promise<any[]> {
    const [rows] = await this.pool.query(
      `SELECT provider, mode, app_id, merchant_id, notify_url, is_active
       FROM crm_payment_provider_configs
       WHERE is_active = 1
       ORDER BY provider, id DESC`,
    );
    return rows as any[];
  }
}
