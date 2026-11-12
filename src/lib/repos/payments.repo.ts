/**
 * 支付订单数据访问；套餐和权益不属于本 Repo。
 *
 * **2026-11-12 起物理存储为统一表 `orders`（product_kind='plan'）**：
 * 本仓储的对外方法签名与返回行形状保持不变（SQL 侧用列别名把 `product_code` 还原成
 * `plan_code`），上层服务与既有单测无需改动。
 *
 * 年包抵扣的核销锚点仍用 `original_order_no`：抵扣单落库时把服务单号写进该列，
 * 于是「已被 pending/paid 订单引用」= 已核销。合一表后这一步从跨表 NOT EXISTS
 * 变成同表自连接，语义不变、少一次表访问。
 */
import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { PaymentOrderRow } from "./types";

export class PaymentsRepo {
  constructor(private pool: Pool) {}
  getConnection(): Promise<PoolConnection> { return this.pool.getConnection(); }

  async findByOrderNo(orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, order_no, user_id, provider, product_code AS plan_code, order_type, original_order_no,
              amount, currency, status, notice_id, industry_code, provider_trade_no, pay_url, qr_code_url,
              paid_at, created_at, updated_at, raw_request, raw_notify
         FROM orders WHERE order_no = ? AND product_kind = 'plan' LIMIT 1`, [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  async findPendingOrder(p: { userId: number; planCode: string; provider: string; noticeId: number | null; industryCode?: string | null }): Promise<PaymentOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT order_no, provider, product_code AS plan_code, amount, currency, status, notice_id, industry_code, pay_url, qr_code_url
         FROM orders WHERE user_id = ? AND product_kind = 'plan' AND product_code = ? AND provider = ?
          AND status = 'pending' AND notice_id <=> ? AND industry_code <=> ? ORDER BY id DESC LIMIT 1`,
      [p.userId, p.planCode, p.provider, p.noticeId, p.industryCode ?? null],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  /**
   * 找一张可用（已成交且未被核销）的「年包抵扣」服务单——承载 260928 报价表「199 升级年包可
   * 全额抵扣」：service_catalog.credit_to_annual_plan=1 的服务成交单，可折抵一次年付套餐购买。
   *
   * 不另建中间表（多写者风险），核销锚点直接用 `original_order_no` 列。
   * 不要求服务行仍 is_active——承诺在成交时已作出，后续下架不该没收抵扣权。
   */
  async findUsableAnnualPlanCredit(userId: number): Promise<{ order_no: string; amount: string; currency: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT so.order_no, so.unit_price AS amount, so.currency
         FROM orders so
         JOIN service_catalog sc ON sc.service_code = so.product_code
        WHERE so.user_id = ?
          AND so.product_kind = 'service'
          AND sc.credit_to_annual_plan = 1
          AND so.status = 'paid'
          AND so.unit_price > 0
          AND NOT EXISTS (
                SELECT 1 FROM orders po
                 WHERE po.original_order_no = so.order_no
                   AND po.product_kind = 'plan'
                   AND po.status IN ('pending','paid')
          )
        ORDER BY so.id ASC LIMIT 1`,
      [userId],
    );
    return ((rows as Array<{ order_no: string; amount: string; currency: string }>)[0]) ?? null;
  }

  async createOrder(p: {
    userId: number; orderNo: string; provider: string; planCode: string; noticeId: number | null;
    industryCode?: string | null;
    /** 下单时的套餐名快照（目录改名不影响历史单）；缺省留空 */
    productName?: string;
    amount: number; currency: string; payUrl: string | null; qrCodeUrl: string | null; rawRequest: string;
    orderType?: string; originalOrderNo?: string | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO orders
        (user_id, order_no, provider, product_kind, product_code, product_name, order_type, original_order_no,
         notice_id, industry_code, unit_price, quantity, amount, currency, status, pay_url, qr_code_url, raw_request, created_at)
       VALUES (?, ?, ?, 'plan', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending', ?, ?, ?, NOW())`,
      [p.userId, p.orderNo, p.provider, p.planCode, p.productName ?? "", p.orderType ?? "new",
        p.originalOrderNo ?? null, p.noticeId, p.industryCode ?? null,
        p.amount, p.amount, p.currency, p.payUrl, p.qrCodeUrl, p.rawRequest],
    );
  }

  async updatePendingOrder(orderNo: string, p: {
    amount: number; currency: string; payUrl: string | null; qrCodeUrl: string | null; rawRequest: string;
    industryCode?: string | null;
  }): Promise<void> {
    const [updated] = await this.pool.execute<ResultSetHeader>(
      `UPDATE orders SET amount = ?, unit_price = ?, currency = ?, pay_url = ?, qr_code_url = ?,
              industry_code = ?, raw_request = ?, updated_at = NOW()
        WHERE order_no = ? AND product_kind = 'plan' AND status = 'pending'`,
      [p.amount, p.amount, p.currency, p.payUrl, p.qrCodeUrl, p.industryCode ?? null, p.rawRequest, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async findOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<PaymentOrderRow | null> {
    const [rows] = await conn.query(
      `SELECT id, order_no, user_id, provider, product_code AS plan_code, order_type, original_order_no,
              notice_id, industry_code, amount, currency, status, raw_request, paid_at
         FROM orders WHERE order_no = ? AND product_kind = 'plan' LIMIT 1 FOR UPDATE`, [orderNo],
    );
    return (rows as PaymentOrderRow[])[0] ?? null;
  }

  async markAsPaidInTransaction(conn: PoolConnection, orderNo: string, tradeNo: string | null): Promise<void> {
    const [updated] = await conn.execute<ResultSetHeader>(
      `UPDATE orders SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no),
              paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
        WHERE order_no = ? AND product_kind = 'plan' AND status = 'pending'`, [tradeNo, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async markAsMockPaidInTransaction(conn: PoolConnection, orderNo: string, rawNotify: string): Promise<void> {
    const [updated] = await conn.execute<ResultSetHeader>(
      `UPDATE orders SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
        WHERE order_no = ? AND product_kind = 'plan' AND status = 'pending' AND provider = 'mock'`,
      [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
    if (updated.affectedRows !== 1) throw new Error("ORDER_STATE_CONFLICT");
  }

  async upsertNoticeInterestInTransaction(conn: PoolConnection, userId: number, noticeId: number): Promise<void> {
    await conn.execute(`INSERT INTO notice_interests (user_id, notice_id, interest_type, source)
      VALUES (?, ?, 'subscribed', 'payment') ON DUPLICATE KEY UPDATE updated_at = NOW()`, [userId, noticeId]);
  }

  async findOrderAmount(orderNo: string): Promise<{ amount: number; status: string } | null> {
    const [rows] = await this.pool.query(
      "SELECT amount, status FROM orders WHERE order_no = ? AND product_kind = 'plan' LIMIT 1", [orderNo],
    );
    const row = (rows as Array<{ amount: string | number; status: string }>)[0];
    return row ? { amount: Number(row.amount), status: row.status } : null;
  }
}
