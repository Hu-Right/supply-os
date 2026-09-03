/**
 * 学习资料订单数据访问层
 * Learning Orders Repository
 *
 * @module repos/learning-orders.repo
 * @description ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单的 CRUD + 履约事务。
 *              与 PaymentsRepo（会员订单 CRUD）职责分离，各自操作独立物理表。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/** 学习订单行 */
export interface LearningOrderRow {
  id: number;
  order_no: string;
  user_key: string;
  user_id: number | null;
  plan_code: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  provider_trade_no: string | null;
  pay_url: string | null;
  qr_code_url: string | null;
  raw_request: string | null;
  raw_notify: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

export class LearningOrdersRepo {
  constructor(private pool: Pool) {}

  /** 获取数据库连接（事务场景使用） */
  getConnection(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** 按订单号查询 */
  async findByOrderNo(orderNo: string): Promise<LearningOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT * FROM learning_orders WHERE order_no = ? LIMIT 1`,
      [orderNo],
    );
    return (rows as LearningOrderRow[])[0] ?? null;
  }

  /** 按用户查询订单（可选状态过滤） */
  async findByUserKey(userId: number, status: string): Promise<LearningOrderRow[]> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT * FROM learning_orders ${where} ORDER BY id DESC`,
      params,
    );
    return rows as LearningOrderRow[];
  }

  /** 按用户统计订单数 */
  async countByUserKey(userId: number, status: string): Promise<number> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM learning_orders ${where}`,
      params,
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /** 查询订单金额（回调金额校验用） */
  async findOrderAmount(orderNo: string): Promise<{ amount: number; status: string } | null> {
    const [rows] = await this.pool.query(
      "SELECT amount, status FROM learning_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { amount: Number(row.amount || 0), status: row.status } : null;
  }

  /** 创建学习订单 */
  async createOrder(data: {
    userId: number;
    userKey: string;
    orderNo: string;
    provider: string;
    planCode: string;
    amount: number;
    currency: string;
    payUrl: string | null;
    qrCodeUrl: string | null;
    rawRequest: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO learning_orders
        (order_no, user_id, plan_code, amount, currency, provider, status, pay_url, qr_code_url, raw_request, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())`,
      [
        data.orderNo, data.userId, data.planCode,
        data.amount, data.currency, data.provider,
        data.payUrl, data.qrCodeUrl, data.rawRequest,
      ],
    );
  }

  /** 悲观锁查询订单（事务内使用） */
  async findOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<LearningOrderRow | null> {
    const [rows] = await conn.query(
      "SELECT * FROM learning_orders WHERE order_no = ? LIMIT 1 FOR UPDATE",
      [orderNo],
    );
    return (rows as LearningOrderRow[])[0] ?? null;
  }

  /** 事务内标记订单为已支付 */
  async markAsPaidInTransaction(
    conn: PoolConnection, orderNo: string, providerTradeNo: string | null,
  ): Promise<void> {
    await conn.execute(
      `UPDATE learning_orders
       SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no),
           paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
       WHERE order_no = ? AND status = 'pending'`,
      [providerTradeNo, orderNo],
    );
  }

  /** 事务内 mock 支付落库 */
  async markAsMockPaidInTransaction(
    conn: PoolConnection, orderNo: string, rawNotify: string,
  ): Promise<void> {
    await conn.execute(
      `UPDATE learning_orders
       SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
       WHERE order_no = ?`,
      [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
  }

  /** 事务内标记订单为已退款 */
  async markAsRefundedInTransaction(conn: PoolConnection, orderNo: string): Promise<number> {
    const [result] = await conn.execute(
      "UPDATE learning_orders SET status = 'refunded', updated_at = NOW() WHERE order_no = ? AND status = 'paid'",
      [orderNo],
    );
    return Number((result as { affectedRows?: number }).affectedRows || 0);
  }
}
