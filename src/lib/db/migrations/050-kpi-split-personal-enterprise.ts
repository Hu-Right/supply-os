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

/** 全员 KPI 拆分目标 */
const KPI_SPLIT = [
  { name: "小曹",   personal: 180,  enterprise: 330  },
  { name: "甜甜",   personal: 130,  enterprise: 180  },
  { name: "于雷",   personal: 280,  enterprise: 420  },
  { name: "啊历",   personal: 154,  enterprise: 364  }, // 70% of 220/520
  { name: "许丹",   personal: 66,   enterprise: 156  }, // 30% of 220/520
  { name: "李建森", personal: 70,   enterprise: 1000 },
  { name: "王超",   personal: 120,  enterprise: 550  },
] as const;

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

    // ── 3. 回填拆分后的 KPI 目标值 ──
    for (const row of KPI_SPLIT) {
      await dbPool.execute(
        `UPDATE crm_employees
         SET kpi_personal = ?, kpi_enterprise = ?
         WHERE name = ?`,
        [row.personal, row.enterprise, row.name],
      );
    }
    console.log("[seeds] crm_employees KPI 拆分目标已回填（外贸员/企业）");

    // ── 4. 打印验证 ──
    const [rows] = await dbPool.query(
      `SELECT name, kpi_personal, kpi_enterprise,
              (COALESCE(kpi_personal,0) + COALESCE(kpi_enterprise,0)) AS kpi_total
       FROM crm_employees
       ORDER BY id`,
    );
    console.log("[seeds] KPI 拆分验证：");
    for (const r of rows as Array<{ name: string; kpi_personal: number; kpi_enterprise: number; kpi_total: number }>) {
      console.log(`  ${r.name}：外贸员=${r.kpi_personal} + 企业=${r.kpi_enterprise} = 总${r.kpi_total}`);
    }
  },
};
