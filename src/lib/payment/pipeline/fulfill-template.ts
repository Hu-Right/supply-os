/**
 * 统一事务履约模板
 * Unified Transaction-based Fulfillment Template
 *
 * @module lib/payment/pipeline/fulfill-template
 * @description ARCH-PN（2026-09-11）：支付归一化重构——提取 6 处重复的
 *              "begin TX → SELECT FOR UPDATE → 状态白名单校验 → markAsPaid → 回调 → commit/rollback"
 *              事务外壳代码。
 *
 *              消费方：
 *              - activate.ts 的 activatePaidOrder（会员真实支付履约）
 *              - mock.ts 的 fulfillMockPayment（会员 mock 支付履约）
 *              - LearningPaymentService.fulfillOrder / fulfillMockOrder
 *              - TrainingPaymentService.fulfillOrder / fulfillMockOrder
 *
 *              各服务只需提供 DB 操作回调和权益发放回调，
 *              事务管理（连接获取、begin/commit/rollback/release）由管道统一处理。
 */
import type { PoolConnection } from "mysql2/promise";
import { ORDER_STATUS } from "@/shared/constants/order-status";

/** 事务内订单行的最小字段 */
export interface FulfillableOrderRow {
  order_no: string;
  status: string;
  user_id?: number | null;
  plan_code?: string;
  amount?: number | string;
  order_type?: string;
  notice_id?: number | null;
  [key: string]: unknown;
}

/** 事务履约模板输入 */
export interface FulfillTransactionInput {
  /** 获取数据库连接 */
  getConnection: () => Promise<PoolConnection>;
  /** 悲观锁查询订单（事务内使用，SELECT ... FOR UPDATE） */
  findOrderForUpdate: (conn: PoolConnection, orderNo: string) => Promise<FulfillableOrderRow | null>;
  /** 标记订单为已支付（事务内执行） */
  markAsPaid: (conn: PoolConnection, orderNo: string, providerTradeNo: string | null) => Promise<void>;
  /** 业务特定的权益发放回调（在 markAsPaid 之后、commit 之前执行） */
  onFulfill: (conn: PoolConnection, order: FulfillableOrderRow) => Promise<void>;
  /** 订单号 */
  orderNo: string;
  /** 支付渠道交易号 */
  providerTradeNo?: string | null;
  /** 允许履约的源状态白名单（默认 ['pending']，培训为 ['pending', 'expired']） */
  allowedStatuses?: string[];
}

/**
 * 统一事务履约模板。
 *
 * 流程：
 * 1. 获取连接 → beginTransaction
 * 2. SELECT ... FOR UPDATE 悲观锁查询订单
 * 3. 订单不存在 → commit + return（幂等）
 * 4. 状态白名单校验（allowedStatuses 或默认 ['pending']）
 * 5. markAsPaid 更新订单状态
 * 6. onFulfill 业务特定权益发放
 * 7. commit / catch → rollback / finally → release
 */
export async function fulfillInTransaction(
  input: FulfillTransactionInput,
): Promise<void> {
  const {
    getConnection,
    findOrderForUpdate,
    markAsPaid,
    onFulfill,
    orderNo,
    providerTradeNo = null,
    allowedStatuses = [ORDER_STATUS.PENDING],
  } = input;

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // 悲观锁：SELECT ... FOR UPDATE 防止并发重复发放
    const order = await findOrderForUpdate(conn, orderNo);
    if (!order) {
      await conn.commit();
      return;
    }

    // 状态机白名单校验：仅允许指定状态的订单可履约
    if (!allowedStatuses.includes(order.status)) {
      await conn.commit();
      return;
    }

    // 标记订单已支付
    await markAsPaid(conn, orderNo, providerTradeNo);

    // 业务特定权益发放（在事务内执行）
    await onFulfill(conn, order);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
