/**
 * 031: 会员套餐平滑升级支持
 * crm_user_entitlements 新增升级标记列，crm_payment_orders 新增订单类型列
 *
 * @module server/db/migrations/031-membership-upgrade
 * @description 支持会员套餐从低价向高价平滑升级（补差价）：
 *              1. crm_user_entitlements:
 *                 - upgraded_from_entitlement_id：升级产生的新权益指向原权益 ID（审计链）
 *                 - is_upgraded：旧权益被升级替代后置 1，配额查询需排除
 *              2. crm_payment_orders:
 *                 - order_type：'new'（新购）/ 'upgrade'（升级补差）
 *                 - original_order_no：升级订单关联的原订单号
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 31,
  name: "membership-upgrade",
  async up(dbPool: Pool) {
    // ── crm_user_entitlements：升级标记列 ──
    await ensureColumn(
      dbPool, "crm_user_entitlements", "upgraded_from_entitlement_id",
      "upgraded_from_entitlement_id BIGINT UNSIGNED NULL AFTER source_order_no",
    );
    await ensureColumn(
      dbPool, "crm_user_entitlements", "is_upgraded",
      "is_upgraded TINYINT NOT NULL DEFAULT 0 AFTER status",
    );
    await ensureIndex(
      dbPool, "crm_user_entitlements", "idx_upgraded_from",
      "ALTER TABLE crm_user_entitlements ADD KEY idx_upgraded_from (upgraded_from_entitlement_id)",
    );

    // ── crm_payment_orders：订单类型列 ──
    await ensureColumn(
      dbPool, "crm_payment_orders", "order_type",
      "order_type VARCHAR(20) NOT NULL DEFAULT 'new' AFTER plan_code",
    );
    await ensureColumn(
      dbPool, "crm_payment_orders", "original_order_no",
      "original_order_no VARCHAR(80) NULL AFTER order_type",
    );
  },
};
