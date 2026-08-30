/**
 * 050: KPI 目标拆分为外贸员注册与企业注册
 * kpi-split-personal-enterprise
 *
 * 在 crm_employees 表新增 kpi_personal（外贸员注册目标）和 kpi_enterprise（企业注册目标），
 * 并回填全员拆分后的 KPI 目标值。
 *
 * 拆分规则（9.1-9.30 KPI 分配表）：
 *   小曹     外贸员=180  企业=330  总=510
 *   甜甜     外贸员=130  企业=180  总=310
 *   于雷     外贸员=280  企业=420  总=700
 *   啊历+许丹  外贸员=220  企业=520  总=740（许丹30%/啊历70%）
 *   李建森   外贸员=70   企业=1000 总=1070
 *   王超     外贸员=120  企业=550  总=670
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 50,
  name: "kpi-split-personal-enterprise",
  async up(dbPool: Pool) {
    // ── 1. 新增 kpi_personal 列 ──
    await ensureColumn(
      dbPool,
      "crm_employees",
      "kpi_personal",
      "kpi_personal INT UNSIGNED NULL DEFAULT NULL COMMENT '外贸员注册KPI目标数'",
    );

    // ── 2. 新增 kpi_enterprise 列 ──
    await ensureColumn(
      dbPool,
      "crm_employees",
      "kpi_enterprise",
      "kpi_enterprise INT UNSIGNED NULL DEFAULT NULL COMMENT '企业注册KPI目标数'",
    );

    // 种子数据回填已禁用——不再对数据库进行任何读写
    console.log("[migration-050] KPI 拆分目标回填已禁用，仅完成列结构变更");
  },
};
