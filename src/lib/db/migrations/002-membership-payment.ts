/**
 * 002: 会员与支付表
 * crm_membership_plans, crm_user_subscriptions, crm_payment_orders,
 * crm_payment_provider_configs, crm_user_entitlements
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureColumnType, type Migration } from "./runner";

export const migration: Migration = {
  version: 2,
  name: "membership-payment",
  async up(dbPool: Pool) {
    // 会员计划
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_membership_plans (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        plan_code VARCHAR(60) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        description VARCHAR(255) NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
        duration_days INT NULL,
        unlock_quota INT NOT NULL DEFAULT 0,
        free_quota INT NOT NULL DEFAULT 0,
        plan_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
        is_active TINYINT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_active_sort (is_active, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 用户订阅
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_subscriptions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        plan_code VARCHAR(60) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_key_status (user_key, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_user_subscriptions", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

    // 支付订单
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_payment_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        order_no VARCHAR(80) NOT NULL UNIQUE,
        user_key VARCHAR(190) NOT NULL,
        provider ENUM('alipay','wechat','mock') NOT NULL,
        plan_code VARCHAR(60) NOT NULL,
        notice_id BIGINT UNSIGNED NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
        status ENUM('pending','paid','closed','failed') NOT NULL DEFAULT 'pending',
        provider_trade_no VARCHAR(120) NULL,
        pay_url VARCHAR(500) NULL,
        qr_code_url VARCHAR(500) NULL,
        raw_request JSON NULL,
        raw_notify JSON NULL,
        paid_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_status (user_key, status),
        KEY idx_plan_code (plan_code),
        KEY idx_notice_id (notice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_payment_orders", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
    await ensureColumn(dbPool, "crm_payment_orders", "pay_url", "pay_url VARCHAR(500) NULL AFTER provider_trade_no");
    await ensureColumn(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url VARCHAR(500) NULL AFTER pay_url");
    await ensureColumn(dbPool, "crm_payment_orders", "raw_request", "raw_request JSON NULL AFTER qr_code_url");
    await ensureColumn(dbPool, "crm_payment_orders", "raw_notify", "raw_notify JSON NULL AFTER raw_request");
    await ensureColumn(dbPool, "crm_payment_orders", "paid_at", "paid_at DATETIME NULL AFTER raw_notify");
    await ensureColumnType(dbPool, "crm_payment_orders", "provider", "provider ENUM('alipay','wechat','mock') NOT NULL");
    await ensureColumnType(dbPool, "crm_payment_orders", "pay_url", "pay_url TEXT NULL");
    await ensureColumnType(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url TEXT NULL");

    // 支付渠道配置
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_payment_provider_configs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        provider ENUM('alipay','wechat') NOT NULL,
        mode VARCHAR(30) NOT NULL DEFAULT 'mock',
        app_id VARCHAR(190) NULL,
        merchant_id VARCHAR(190) NULL,
        notify_url VARCHAR(500) NULL,
        return_url VARCHAR(500) NULL,
        public_key TEXT NULL,
        private_key_ref VARCHAR(500) NULL,
        cert_ref VARCHAR(500) NULL,
        is_active TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_provider_mode (provider, mode),
        KEY idx_provider_active (provider, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_payment_provider_configs", "mode", "mode VARCHAR(30) NOT NULL DEFAULT 'mock' AFTER provider");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "app_id", "app_id VARCHAR(190) NULL AFTER mode");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "merchant_id", "merchant_id VARCHAR(190) NULL AFTER app_id");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "notify_url", "notify_url VARCHAR(500) NULL AFTER merchant_id");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "return_url", "return_url VARCHAR(500) NULL AFTER notify_url");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "public_key", "public_key TEXT NULL AFTER return_url");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref VARCHAR(500) NULL AFTER public_key");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "cert_ref", "cert_ref VARCHAR(500) NULL AFTER private_key_ref");
    await ensureColumn(dbPool, "crm_payment_provider_configs", "is_active", "is_active TINYINT NOT NULL DEFAULT 0 AFTER cert_ref");
    await ensureColumnType(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref TEXT NULL");

    // 用户权益
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_entitlements (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        user_key VARCHAR(190) NOT NULL,
        source_order_no VARCHAR(80) NULL,
        plan_code VARCHAR(60) NOT NULL,
        quota_total INT NOT NULL DEFAULT 0,
        quota_used INT NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_status_expire (user_key, status, expires_at),
        KEY idx_source_order (source_order_no),
        KEY idx_plan_code (plan_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(dbPool, "crm_user_entitlements", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
    await ensureColumn(dbPool, "crm_user_entitlements", "source_order_no", "source_order_no VARCHAR(80) NULL AFTER user_key");
    await ensureColumn(dbPool, "crm_user_entitlements", "plan_code", "plan_code VARCHAR(60) NOT NULL AFTER source_order_no");
    await ensureColumn(dbPool, "crm_user_entitlements", "quota_total", "quota_total INT NOT NULL DEFAULT 0 AFTER plan_code");
    await ensureColumn(dbPool, "crm_user_entitlements", "quota_used", "quota_used INT NOT NULL DEFAULT 0 AFTER quota_total");
    await ensureColumn(dbPool, "crm_user_entitlements", "expires_at", "expires_at DATETIME NULL AFTER started_at");
    await ensureColumn(dbPool, "crm_user_entitlements", "status", "status VARCHAR(30) NOT NULL DEFAULT 'active' AFTER expires_at");
  },
};
