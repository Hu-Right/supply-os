/**
 * 045: 用户注册类型区分
 * user-registration-type
 *
 * 为 crm_users 新增 user_type 列，区分个人注册（外贸从业者）和企业注册（供应商）。
 * 用于 KPI 分类统计（外贸员注册 vs 企业注册）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 45,
  name: "user-registration-type",
  async up(dbPool: Pool) {
    // user_type: 'personal' = 外贸从业者（个人注册）, 'enterprise' = 供应商（企业注册）
    await ensureColumn(
      dbPool,
      "crm_users",
      "user_type",
      "user_type VARCHAR(20) NOT NULL DEFAULT 'enterprise' AFTER account_status",
    );

    await ensureIndex(
      dbPool,
      "crm_users",
      "idx_user_type",
      "CREATE INDEX idx_user_type ON crm_users (user_type)",
    );
  },
};
