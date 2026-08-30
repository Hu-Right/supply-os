/**
 * 050: KPI 目标拆分为外贸员注册与企业注册（已移交外部 CRM）
 * kpi-split-personal-enterprise
 *
 * crm_employees 的 KPI 字段（kpi_target / kpi_personal / kpi_enterprise）
 * 自员工业绩查询移交独立 CRM 系统后，其列结构由外部系统自行管理。
 * 本迁移不再创建或删除这些字段，仅保留版本占位以保证迁移序列连续。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 50,
  name: "kpi-split-personal-enterprise",
  async up(dbPool: Pool) {
    // crm_employees 的 KPI 字段归外部 CRM 管理：不创建、不删除、不读写
    void dbPool;
    console.log("[migration-050] KPI 字段已移交外部 CRM，跳过结构变更");
  },
};
