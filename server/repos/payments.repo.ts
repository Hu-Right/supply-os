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
import type { PaymentOrderRow } from "./types";

export class PaymentsRepo {
  constructor(private pool: Pool) {}

  /** 按订单号查询订单 */
  async findByOrderNo(orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, provider, plan_code, amount, currency, status, notice_id,
              provider_trade_no, paid_at
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
}
