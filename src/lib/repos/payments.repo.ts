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

  /**
   * 找一张可用（已成交且未被核销）的「年包抵扣」服务单——承载 260928 报价表「199 升级年包可
   * 全额抵扣」：crm_service_catalog.credit_to_annual_plan=1 的服务成交单，可折抵一次年付套餐购买。
   *
   * 不另建中间表（多写者风险），核销锚点直接用本 Repo 已有的 original_order_no 列：
   * 抵扣单落库时把服务单号写进 crm_payment_orders.original_order_no，于是「已被 pending/paid
   * 订单引用」= 已核销。不要求服务行仍 is_active——承诺在成交时已作出，后续下架不该没收抵扣权。
   */
  async findUsableAnnualPlanCredit(userId: number): Promise<{ order_no: string; amount: string; currency: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT so.order_no, so.unit_price_snapshot AS amount, so.currency
         FROM crm_service_orders so
         JOIN crm_service_catalog sc ON sc.service_code = so.service_code
        WHERE so.user_id = ?
          AND sc.credit_to_annual_plan = 1
          AND so.status = 'paid'
          AND so.unit_price_snapshot > 0
          AND NOT EXISTS (
                SELECT 1 FROM crm_payment_orders po
                 WHERE po.original_order_no = so.order_no AND po.status IN ('pending','paid')
          )
        ORDER BY so.id ASC LIMIT 1`,
      [userId],
    );
    return ((rows as Array<{ order_no: string; amount: string; currency: string }>)[0]) ?? null;
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
