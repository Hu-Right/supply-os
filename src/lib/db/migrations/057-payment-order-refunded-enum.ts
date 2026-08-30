/**
 * 057: 支付订单状态枚举补齐 refunded
 * payment-order-refunded-enum
 *
 * 退款回滚链路（fulfillment.reverseFulfilledOrder，支付宝 TRADE_CLOSED 异步通知）
 * 会将订单状态写为 'refunded'，但 002 建表时 status 枚举缺少该值：
 * MySQL 严格模式下退款回调会直接报错，非严格模式则截断为空串。
 * 本迁移补齐枚举值；对已手工修改过的库重跑安全（MODIFY 为相同定义无副作用）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 57,
  name: "payment-order-refunded-enum",
  async up(dbPool: Pool) {
    await dbPool.query(
      "ALTER TABLE crm_payment_orders MODIFY COLUMN status ENUM('pending','paid','closed','failed','refunded') NOT NULL DEFAULT 'pending'",
    );
    console.log("[migrate-057] crm_payment_orders.status 枚举已补齐 refunded");
  },
};
