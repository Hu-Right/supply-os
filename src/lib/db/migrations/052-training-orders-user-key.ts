/**
 * 052: 培训订单表补全 user_key 列 + 报名表补全支付状态列
 * training-orders-user-key-and-registration-payment-columns
 *
 * 修复 training_orders 表缺少 user_key 列（导致所有订单查询/mock支付/学员保存 403），
 * 以及 crm_training_registrations 表缺少 payment_status / order_id 列
 * （导致支付履约时 updateRegistrationPayment 报错）。
 *
 * 背景：migration 034 的 ensureColumn 调用未能成功添加这两列到 crm_training_registrations，
 *       且 training_orders 创建时遗漏了 user_key 列。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 52,
  name: "training-orders-user-key-and-registration-payment-columns",
  async up(dbPool: Pool) {
    // ── 1. training_orders 补全缺失列：contact_name / telephone / user_key ──
    // 注意：migration 034 的 CREATE TABLE 包含这些列，但生产库同步时可能未包含
    await ensureColumn(
      dbPool,
      "training_orders",
      "contact_name",
      "contact_name VARCHAR(100) NULL COMMENT '联系人姓名'",
    );
    await ensureColumn(
      dbPool,
      "training_orders",
      "telephone",
      "telephone VARCHAR(50) NULL COMMENT '联系电话'",
    );
    await ensureColumn(
      dbPool,
      "training_orders",
      "user_key",
      "user_key VARCHAR(64) NULL COMMENT '下单用户标识（手机号/邮箱）'",
    );
    console.log("[migration-052] training_orders 缺失列已补全 (contact_name, telephone, user_key)");

    // ── 2. crm_training_registrations 新增 payment_status 列 ──
    await ensureColumn(
      dbPool,
      "crm_training_registrations",
      "payment_status",
      "payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' AFTER audit_status",
    );
    console.log("[migration-052] crm_training_registrations.payment_status 列已添加");

    // ── 3. crm_training_registrations 新增 order_id 列 ──
    await ensureColumn(
      dbPool,
      "crm_training_registrations",
      "order_id",
      "order_id BIGINT UNSIGNED NULL AFTER payment_status",
    );
    console.log("[migration-052] crm_training_registrations.order_id 列已添加");

    // ── 4. 为 training_orders.user_key 添加索引 ──
    const [idxRows] = await dbPool.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_orders' AND INDEX_NAME = 'idx_training_orders_user_key'`,
    );
    if (Number((idxRows as Array<{ total: number }>)[0]?.total || 0) === 0) {
      await dbPool.query(
        "ALTER TABLE training_orders ADD INDEX idx_training_orders_user_key (user_key)",
      );
      console.log("[migration-052] training_orders.idx_training_orders_user_key 索引已添加");
    }

    console.log("[migration-052] 全部完成");
  },
};
