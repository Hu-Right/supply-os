/**
 * 学习资料订单数据访问层
 * Learning Orders Repository
 *
 * @module repos/learning-orders.repo
 * @description 学习资料 / 打包套餐订单的 CRUD + 履约事务。
 *              **2026-11-12 起物理存储为统一表 `orders`（product_kind IN material/bundle）**，
 *              对外方法签名与 `LearningOrderRow` 形状保持不变：
 *              `plan_code` 由 `CONCAT(product_kind,'_',product_code)` 还原
 *              （material_x → "material_x"、bundle_all → "bundle_all"，与原码形逐字一致），
 *              上层 `learning-payment` 里的前缀判断因此无需改动。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { classifyProductCode, stripProductPrefix } from "@/shared/constants/product-kind";
import { ORDER_PAY_WINDOW_MINUTES } from "@/shared/constants/order-status";

/** 学习订单行 */
export interface LearningOrderRow {
  id: number;
  order_no: string;
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

/** 列投影：orders → LearningOrderRow（plan_code 由两列拼回原码形） */
const ROW_COLUMNS = `id, order_no, user_id,
  CONCAT(product_kind, '_', product_code) AS plan_code,
  amount, currency, provider, status, provider_trade_no, pay_url, qr_code_url,
  raw_request, raw_notify, paid_at, created_at, updated_at`;

const KIND_SCOPE = "product_kind IN ('material','bundle')";

export class LearningOrdersRepo {
  constructor(private pool: Pool) {}

  /** 获取数据库连接（事务场景使用） */
  getConnection(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** 按订单号查询 */
  async findByOrderNo(orderNo: string): Promise<LearningOrderRow | null> {
    const [rows] = await this.pool.query(
      `SELECT ${ROW_COLUMNS} FROM orders WHERE order_no = ? AND ${KIND_SCOPE} LIMIT 1`,
      [orderNo],
    );
    return (rows as LearningOrderRow[])[0] ?? null;
  }

  /** 按用户查询订单（可选状态过滤） */
  async findByUserId(userId: number, status: string): Promise<LearningOrderRow[]> {
    const params: unknown[] = [userId];
    let where = `WHERE user_id = ? AND ${KIND_SCOPE}`;
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT ${ROW_COLUMNS} FROM orders ${where} ORDER BY id DESC`,
      params,
    );
    return rows as LearningOrderRow[];
  }

  /** 按用户统计订单数 */
  async countByUserId(userId: number, status: string): Promise<number> {
    const params: unknown[] = [userId];
    let where = `WHERE user_id = ? AND ${KIND_SCOPE}`;
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      params,
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /** 查询订单金额（回调金额校验用） */
  async findOrderAmount(orderNo: string): Promise<{ amount: number; status: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT amount, status FROM orders WHERE order_no = ? AND ${KIND_SCOPE} LIMIT 1`,
      [orderNo],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { amount: Number(row.amount || 0), status: row.status } : null;
  }

  /** 创建学习订单 */
  async createOrder(data: {
    userId: number;
    orderNo: string;
    provider: string;
    planCode: string;
    /** 下单时的商品名快照；缺省留空 */
    productName?: string;
    amount: number;
    currency: string;
    payUrl: string | null;
    qrCodeUrl: string | null;
    rawRequest: string;
  }): Promise<void> {
    const kind = classifyProductCode(data.planCode);
    const expiresAt = new Date(Date.now() + ORDER_PAY_WINDOW_MINUTES * 60_000);
    await this.pool.execute(
      `INSERT INTO orders
        (order_no, user_id, product_kind, product_code, product_name, unit_price, quantity,
         amount, currency, provider, status, pay_url, qr_code_url, raw_request, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())`,
      [
        data.orderNo, data.userId, kind, stripProductPrefix(data.planCode), data.productName ?? "",
        data.amount, data.amount, data.currency, data.provider,
        data.payUrl, data.qrCodeUrl, data.rawRequest, expiresAt,
      ],
    );
  }

  /** 悲观锁查询订单（事务内使用） */
  async findOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<LearningOrderRow | null> {
    const [rows] = await conn.query(
      `SELECT ${ROW_COLUMNS} FROM orders WHERE order_no = ? AND ${KIND_SCOPE} LIMIT 1 FOR UPDATE`,
      [orderNo],
    );
    return (rows as LearningOrderRow[])[0] ?? null;
  }

  /** 事务内标记订单为已支付 */
  async markAsPaidInTransaction(
    conn: PoolConnection, orderNo: string, providerTradeNo: string | null,
  ): Promise<void> {
    await conn.execute(
      `UPDATE orders
       SET status = 'paid', provider_trade_no = COALESCE(?, provider_trade_no),
           paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
       WHERE order_no = ? AND ${KIND_SCOPE} AND status = 'pending'`,
      [providerTradeNo, orderNo],
    );
  }

  /** 事务内 mock 支付落库 */
  async markAsMockPaidInTransaction(
    conn: PoolConnection, orderNo: string, rawNotify: string,
  ): Promise<void> {
    await conn.execute(
      `UPDATE orders
       SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
       WHERE order_no = ? AND ${KIND_SCOPE}`,
      [`MOCK-${orderNo}`, rawNotify, orderNo],
    );
  }

  /** 事务内标记退款（全额退：refund_amount = amount） */
  async markAsRefundedInTransaction(conn: PoolConnection, orderNo: string): Promise<number> {
    const [res] = await conn.execute(
      `UPDATE orders SET status = 'refunded', refund_amount = amount, refunded_at = NOW(), updated_at = NOW()
       WHERE order_no = ? AND ${KIND_SCOPE} AND status = 'paid'`,
      [orderNo],
    );
    return (res as { affectedRows?: number })?.affectedRows ?? 0;
  }
}
