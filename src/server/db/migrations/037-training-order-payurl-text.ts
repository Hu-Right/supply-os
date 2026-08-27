/**
 * 037: training_orders.pay_url 升级为 TEXT
 *
 * 支付宝 page.pay 策略返回的是自动提交的 HTML 表单（约 2~4KB），
 * 原 VARCHAR(512) 无法容纳，与会员订单表 crm_payment_orders.pay_url（TEXT）对齐。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumnType, type Migration } from "./runner";

export const migration: Migration = {
  version: 37,
  name: "training-order-payurl-text",
  async up(dbPool: Pool) {
    await ensureColumnType(dbPool, "training_orders", "pay_url", "pay_url TEXT NULL");
  },
};
