/**
 * 059: 学习资料独立订单表
 * learning_orders
 *
 * @description ARCH-B+（2026-09-01）：将学习资料 / 打包套餐的支付订单从
 *              crm_payment_orders 拆分至独立物理表，实现：
 *              - 领域列精简（无 notice_id / order_type / original_order_no 等会员专属列）
 *              - 状态机独立演化（学习订单无 expired / upgrade 等状态）
 *              - 财务对账天然按业务线隔离
 *              订单号前缀 LE（Learning）与会员 SO / 培训 TR 区分。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 59,
  name: "learning-orders",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS learning_orders (
        id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        order_no          VARCHAR(80)  NOT NULL UNIQUE,
        user_key          VARCHAR(190) NOT NULL,
        plan_code         VARCHAR(60)  NOT NULL COMMENT 'material_{id} 或 bundle_{id}',
        amount            DECIMAL(10,2) NOT NULL,
        currency          VARCHAR(10)  NOT NULL DEFAULT 'CNY',
        provider          VARCHAR(20)  NOT NULL,
        status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
        provider_trade_no VARCHAR(120) NULL,
        pay_url           TEXT         NULL,
        qr_code_url       TEXT         NULL,
        raw_request       JSON         NULL,
        raw_notify        JSON         NULL,
        paid_at           DATETIME     NULL,
        created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_lo_user_status (user_key, status),
        KEY idx_lo_plan_code (plan_code),
        KEY idx_lo_provider_trade (provider_trade_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='学习资料 / 打包套餐支付订单表'
    `);
    console.log("[migrate-059] learning_orders 表创建完成");
  },
};
