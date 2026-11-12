/**
 * 服务订单数据访问层 — 封装「增值服务」订单读写
 *
 * @module lib/repos/service-orders.repo
 * @description 增值服务「一次性支付」订单（SV 前缀单）。
 *              **2026-11-12 起物理存储为统一表 `orders`（product_kind='service'）**，
 *              本仓储的对外方法签名与返回行形状保持不变（SQL 侧用列别名还原旧列名），
 *              上层服务无需改动。
 *
 *              本 repo 只承载 **self 在线单**（走真实网关，provider 落真实渠道）；
 *              lead/contract 线下成交不进 orders，由 service_orders 台账承载
 *              （2026-11-12 定位收口，哨兵 provider='service' 退役）。
 *              履约仅置 paid，不做额度充值（见设计 B4）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ORDER_PAY_WINDOW_MINUTES } from "../../shared/constants/order-status";

export interface CreateServiceOrderInput {
  orderNo: string;
  userId: number;
  serviceCode: string;
  /** 下单时的商品名快照（目录改名不影响历史单）；缺省留空 */
  productName?: string;
  unitPrice: string;
  amountTotal: string;
  currency: string;
  saleMode: string;
  /** 收款渠道（alipay/wechat/mock），不再写哨兵 'service' */
  provider: string;
}

export class ServiceOrdersRepo {
  constructor(private pool: Pool) {}

  /** 创建服务订单（pending）。返回自增 id。 */
  async createOrder(input: CreateServiceOrderInput): Promise<number> {
    const expiresAt = new Date(Date.now() + ORDER_PAY_WINDOW_MINUTES * 60_000);
    const [result] = await this.pool.query(
      `INSERT INTO orders
        (order_no, user_id, product_kind, product_code, product_name, unit_price, quantity,
         amount, currency, status, provider, items_snapshot, expires_at)
       VALUES (?, ?, 'service', ?, ?, ?, 1, ?, ?, 'pending', ?, ?, ?)`,
      [
        input.orderNo, input.userId, input.serviceCode, input.productName ?? "",
        input.unitPrice, input.amountTotal, input.currency,
        input.provider,
        JSON.stringify({ saleMode: input.saleMode }),
        expiresAt,
      ],
    );
    return (result as { insertId: number }).insertId;
  }

  /** 回调金额校验用。 */
  async findOrderAmount(orderNo: string): Promise<{ amount: string | number } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT amount AS amount FROM orders WHERE order_no = ? AND product_kind = 'service' LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { amount: row.amount } : null;
  }

  async findByOrderNo(orderNo: string): Promise<{ user_id: number; status: string } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT user_id, status FROM orders WHERE order_no = ? AND product_kind = 'service' LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { user_id: Number(row.user_id), status: row.status } : null;
  }

  async queryStatus(orderNo: string): Promise<{ status: string; amount_total: string; paid_at: Date | null } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT status, amount AS amount_total, paid_at FROM orders WHERE order_no = ? AND product_kind = 'service' LIMIT 1",
      [orderNo],
    );
    const row = rows[0];
    return row ? { status: row.status, amount_total: row.amount_total, paid_at: row.paid_at ?? null } : null;
  }

  /** 幂等履约：pending → paid。返回是否本次更新。 */
  async markPaid(orderNo: string): Promise<boolean> {
    const [result] = await this.pool.query(
      "UPDATE orders SET status = 'paid', paid_at = NOW() WHERE order_no = ? AND product_kind = 'service' AND status = 'pending'",
      [orderNo],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /** 退款通知：非 refunded → refunded（无权益逆向）。009：落退款金额快照与时间。 */
  async markRefunded(orderNo: string): Promise<boolean> {
    const [result] = await this.pool.query(
      "UPDATE orders SET status = 'refunded', refund_amount = amount, refunded_at = NOW(), updated_at = NOW() \
        WHERE order_no = ? AND product_kind = 'service' AND status <> 'refunded'",
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
    let sql = `SELECT order_no, user_id, product_code AS service_code, amount AS amount_total,
                      currency, status, paid_at, created_at
       FROM orders WHERE user_id = ? AND product_kind = 'service'`;
    if (status && status !== "all") { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY id DESC LIMIT 500";
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return rows as Awaited<ReturnType<ServiceOrdersRepo["findByUserId"]>>;
  }

  async countByUserId(userId: number, status = ""): Promise<number> {
    const params: unknown[] = [userId];
    let sql = "SELECT COUNT(*) AS total FROM orders WHERE user_id = ? AND product_kind = 'service'";
    if (status && status !== "all") { sql += " AND status = ?"; params.push(status); }
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return Number(rows[0]?.total || 0);
  }
}
