/**
 * 服务订单数据访问层 — 封装 crm_service_orders 读写
 *
 * @module lib/repos/service-orders.repo
 * @description 增值服务「一次性支付」订单（SV 前缀单）。表无 provider/provider_trade_no/
 *              expires_at 列，故查询走 DB status（同培训分支），不落库渠道/交易号。
 *              履约仅置 paid，不做额度充值（见设计 B4）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface CreateServiceOrderInput {
  orderNo: string;
  userId: number;
  serviceCode: string;
  unitPrice: string;
  amountTotal: string;
  currency: string;
  saleMode: string;
}

export class ServiceOrdersRepo {
  constructor(private pool: Pool) {}

  /** 创建服务订单（pending）。返回自增 id。 */
  async createOrder(input: CreateServiceOrderInput): Promise<number> {
    const [result] = await this.pool.query(
      `INSERT INTO crm_service_orders
        (order_no, user_id, service_code, quantity, unit_price_snapshot, amount_total, currency, status, sale_mode_snapshot)
       VALUES (?, ?, ?, 1, ?, ?, ?, 'pending', ?)`,
      [input.orderNo, input.userId, input.serviceCode, input.unitPrice, input.amountTotal, input.currency, input.saleMode],
    );
    return (result as { insertId: number }).insertId;
  }

  /** 回调金额校验用。 */
  async findOrderAmount(orderNo: string): Promise<{ amount: string | number } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT amount_total AS amount FROM crm_service_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { amount: row.amount } : null;
  }

  async findByOrderNo(orderNo: string): Promise<{ user_id: number; status: string } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT user_id, status FROM crm_service_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { user_id: Number(row.user_id), status: row.status } : null;
  }

  async queryStatus(orderNo: string): Promise<{ status: string; amount_total: string; paid_at: Date | null } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT status, amount_total, paid_at FROM crm_service_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { status: row.status, amount_total: row.amount_total, paid_at: row.paid_at ?? null } : null;
  }

  /** 幂等履约：pending → paid。返回是否本次更新。 */
  async markPaid(orderNo: string): Promise<boolean> {
    const [result] = await this.pool.query(
      "UPDATE crm_service_orders SET status = 'paid', paid_at = NOW() WHERE order_no = ? AND status = 'pending'",
      [orderNo],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /** 退款通知：非 refunded → refunded（无权益逆向）。 */
  async markRefunded(orderNo: string): Promise<boolean> {
    const [result] = await this.pool.query(
      "UPDATE crm_service_orders SET status = 'refunded' WHERE order_no = ? AND status <> 'refunded'",
      [orderNo],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /** 全量订单历史聚合用（按用户，可选状态过滤）。 */
  async findByUserId(userId: number, status = ""): Promise<Array<{
    order_no: string; user_id: number; service_code: string; amount_total: string;
    currency: string; status: string; paid_at: Date | null; created_at: Date;
  }>> {
    const params: unknown[] = [userId];
    let sql = `SELECT order_no, user_id, service_code, amount_total, currency, status, paid_at, created_at
       FROM crm_service_orders WHERE user_id = ?`;
    if (status && status !== "all") { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY id DESC LIMIT 500";
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return rows as Awaited<ReturnType<ServiceOrdersRepo["findByUserId"]>>;
  }

  async countByUserId(userId: number, status = ""): Promise<number> {
    const params: unknown[] = [userId];
    let sql = "SELECT COUNT(*) AS total FROM crm_service_orders WHERE user_id = ?";
    if (status && status !== "all") { sql += " AND status = ?"; params.push(status); }
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return Number(rows[0]?.total || 0);
  }
}
