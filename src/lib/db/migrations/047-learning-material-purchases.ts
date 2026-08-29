/**
 * 047: 学习资料购买记录表
 * learning-material-purchases
 *
 * 持久化用户的学习资料购买记录，与 user_key（手机号）绑定，
 * 确保跨会话购买状态不丢失。支付成功回调时写入此表。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 47,
  name: "learning-material-purchases",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_learning_material_purchases (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_key VARCHAR(64) NOT NULL COMMENT '用户手机号/标识',
        material_id VARCHAR(64) NOT NULL COMMENT '资料ID（如 training-doc-01）',
        order_no VARCHAR(64) NOT NULL COMMENT '关联支付订单号',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '购买金额',
        purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '购买时间',
        UNIQUE KEY uk_user_material (user_key, material_id),
        INDEX idx_user_key (user_key),
        INDEX idx_order_no (order_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习资料购买记录表'
    `);
  },
};
