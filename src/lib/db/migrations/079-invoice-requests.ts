/**
 * 迁移 079 · 发票申请单（费用中心 · 支付后按实付金额补开）
 *
 * @module lib/db/migrations/079-invoice-requests
 * @description 2026-11-24：费用中心一期。发票不在支付环节采集，统一在费用中心
 *              「发票管理」按已支付订单金额申请；一期由财务人工开具，状态机：
 *              pending 待开票 → issuing 开票中 → issued 已开具；
 *              退款/作废：void 作废 / red_flushed 已红冲。
 *              仅建结构，不做种子数据。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 79,
  name: "invoice_requests",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS invoice_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL COMMENT '申请人 users.id',
        order_nos VARCHAR(2000) NOT NULL COMMENT '关联订单号，逗号分隔（合并开票时多条）',
        amount DECIMAL(10,2) NOT NULL COMMENT '可开票金额（实付含税合计）',
        invoice_type VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal=电子普通发票 / special=增值税专用发票',
        title VARCHAR(200) NOT NULL COMMENT '发票抬头（企业实名主体）',
        tax_no VARCHAR(40) NULL COMMENT '统一社会信用代码/税号',
        email VARCHAR(160) NOT NULL COMMENT '接收邮箱',
        address_phone VARCHAR(300) NULL COMMENT '注册地址与电话（专票必填）',
        status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending 待开票 / issuing 开票中 / issued 已开具 / void 作废 / red_flushed 已红冲',
        remark VARCHAR(500) NULL COMMENT '财务处理备注',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        PRIMARY KEY (id),
        KEY idx_invoice_requests_user_status (user_id, status),
        KEY idx_invoice_requests_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT='发票申请单（费用中心按实付金额申请，财务人工开具）'
    `);
  },
};
