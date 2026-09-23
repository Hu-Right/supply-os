/** 支付订单数据访问；套餐和权益不属于本 Repo。 */
import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { PaymentOrderRow } from "./types";

export interface PaymentProviderConfigRow {
  provider: string; mode: string; app_id: string | null;
  merchant_id: string | null; notify_url: string | null; is_active: number;
}

export class PaymentsRepo {
  constructor(private pool: Pool) {}
  getConnection(): Promise<PoolConnection> { return this.pool.getConnection(); }

  async findByOrderNo(orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, order_no, user_id, provider, plan_code, order_type, original_order_no, amount, currency, status,
              notice_id, provider_trade_no, pay_url, qr_code_url, paid_at, created_at, updated_at, raw_request, raw_notify
         FROM crm_payment_orders WHERE order_no = ? LIMIT 1`, [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  async findPendingOrder(p: { userId: number; planCode: string; provider: string; noticeId: number | null }): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, provider, plan_code, amount, currency, status, notice_id, pay_url, qr_code_url
         FROM crm_payment_orders WHERE user_id = ? AND plan_code = ? AND provider = ?
          AND status = 'pending' AND notice_id <=> ? ORDER BY id DESC LIMIT 1`,
      [p.userId, p.planCode, p.provider, p.noticeId],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  async createOrder(p: {
    userId: number; orderNo: string; provider: string; planCode: string; noticeId: number | null;
    amount: number; currency: string; payUrl: string | null; qrCodeUrl: string | null; rawRequest: string;
    orderType?: string; originalOrderNo?: string | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_payment_orders
        (user_id, order_no, provider, plan_code, order_type, original_order_no, notice_id, amount, currency, status, pay_url, qr_code_url, raw_request, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())`,
      [p.userId, p.orderNo, p.provider, p.planCode, p.orderType ?? "new", p.originalOrderNo ?? null,
        p.noticeId, p.amount, p.currency, p.payUrl, p.qrCodeUrl, p.rawRequest],
    );
  }

  async updatePendingOrder(orderNo: string, p: {
    amount: number; currency: string; payUrl: string | null; qrCodeUrl: string | null; rawRequest: string;
  }): Promise<void> {
    const [updated] = await this.pool.execute<ResultSetHeader>(
      `UPDATE crm_payment_orders SET amount = ?, currency = ?, pay_url = ?, qr_code_url = ?, raw_request = ?, updated_at = NOW()
        WHERE order_no = ? AND status = 'pending'`,
      [p.amount, p.currency, p.payUrl, p.qrCodeUrl, p.rawRequest, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async listActiveProviderConfigs(): Promise<PaymentProviderConfigRow[]> {
    const [rows] = await this.pool.query(
      `SELECT provider, mode, app_id, merchant_id, notify_url, is_active
         FROM crm_payment_provider_configs WHERE is_active = 1 ORDER BY provider, id DESC`,
    );
    return rows as PaymentProviderConfigRow[];
  }

  async findOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await conn.query(
      `SELECT id, order_no, user_id, provider, plan_code, order_type, original_order_no, notice_id, amount, currency,
              status, raw_request, paid_at FROM crm_payment_orders WHERE order_no = ? LIMIT 1 FOR UPDATE`, [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  async markAsPaidInTransaction(conn: PoolConnection, orderNo: string, tradeNo: string | null): Promise<void> {
    const [updated] = await conn.execute<ResultSetHeader>(
      `UPDATE crm_payment_orders SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no),
              paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE order_no = ? AND status = 'pending'`, [tradeNo, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async markAsMockPaidInTransaction(conn: PoolConnection, orderNo: string, rawNotify: string): Promise<void> {
    const [updated] = await conn.execute<ResultSetHeader>(
      `UPDATE crm_payment_orders SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
        WHERE order_no = ? AND status = 'pending' AND provider = 'mock'`, [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async upsertNoticeInterestInTransaction(conn: PoolConnection, userId: number, noticeId: number): Promise<void> {
    await conn.execute(`INSERT INTO crm_notice_interests (user_id, notice_id, interest_type, source)
      VALUES (?, ?, 'subscribed', 'payment') ON DUPLICATE KEY UPDATE updated_at = NOW()`, [userId, noticeId]);
  }

  async findOrderAmount(orderNo: string): Promise<{ amount: number; status: string } | null> {
    const [rows] = await this.pool.query("SELECT amount, status FROM crm_payment_orders WHERE order_no = ? LIMIT 1", [orderNo]);
    const row = (rows as Array<{ amount: string | number; status: string }>)[0];
    return row ? { amount: Number(row.amount), status: row.status } : null;
  }
}
