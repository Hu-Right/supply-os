/**
 * 051: KPI 月度化重构 — 合并邀请码 + 新建月度KPI表 + 清理旧表
 * kpi-monthly-restructure
 *
 * 变更内容：
 * 1. crm_employees 新增 invitation_code 列，从 crm_invitation_codes 迁移数据
 * 2. crm_employees 移除 kpi_target / kpi_personal / kpi_enterprise（改存月度表）
 * 3. 新建 crm_monthly_kpi 表（月度KPI目标 + 实际完成）
 * 4. 回填 2026-09 月度KPI种子数据
 * 5. 删除 crm_invitation_codes 表
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

/** 2026-09 KPI 目标（来自 9.1-9.30 KPI 分配表） */
const SEP_2026_KPI = [
  { name: "小曹",   personal: 180,  enterprise: 330  },
  { name: "甜甜",   personal: 130,  enterprise: 180  },
  { name: "于雷",   personal: 280,  enterprise: 420  },
  { name: "啊历",   personal: 154,  enterprise: 364  },
  { name: "许丹",   personal: 66,   enterprise: 156  },
  { name: "李建森", personal: 70,   enterprise: 1000 },
  { name: "王超",   personal: 120,  enterprise: 550  },
] as const;

export const migration: Migration = {
  version: 51,
  name: "kpi-monthly-restructure",
  async up(dbPool: Pool) {
    // ── 1. crm_employees 新增 invitation_code 列 ──
    await ensureColumn(
      dbPool,
      "crm_employees",
      "invitation_code",
      "invitation_code VARCHAR(20) NULL UNIQUE COMMENT '员工邀请码'",
    );

    // ── 2. 从 crm_invitation_codes 迁移邀请码到 crm_employees ──
    await dbPool.query(`
      UPDATE crm_employees e
      INNER JOIN crm_invitation_codes ic ON ic.employee_id = e.id AND ic.is_active = 1
      SET e.invitation_code = ic.code
    `);
    console.log("[migrate] 邀请码已从 crm_invitation_codes 迁移至 crm_employees");

    // ── 3. 新建 crm_monthly_kpi 表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_monthly_kpi (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        employee_id INT UNSIGNED NOT NULL COMMENT '关联员工',
        kpi_month VARCHAR(7) NOT NULL COMMENT '考核月份，格式 YYYY-MM',
        kpi_personal INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '外贸员注册KPI目标',
        kpi_enterprise INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '企业注册KPI目标',
        actual_personal INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '外贸员实际完成数',
        actual_enterprise INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '企业实际完成数',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_employee_month (employee_id, kpi_month),
        CONSTRAINT fk_monthly_kpi_employee FOREIGN KEY (employee_id)
          REFERENCES crm_employees(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] crm_monthly_kpi 表已创建");

    // ── 4. 回填 2026-09 月度KPI种子数据 ──
    const [empRows] = await dbPool.query("SELECT id, name FROM crm_employees");
    const empMap = new Map<string, number>();
    for (const row of empRows as Array<{ id: number; name: string }>) {
      empMap.set(row.name, row.id);
    }

    for (const row of SEP_2026_KPI) {
      const empId = empMap.get(row.name);
      if (!empId) {
        console.warn(`[migrate] 未找到员工 "${row.name}"，跳过KPI种子`);
        continue;
      }
      await dbPool.execute(
        `INSERT INTO crm_monthly_kpi (employee_id, kpi_month, kpi_personal, kpi_enterprise)
         VALUES (?, '2026-09', ?, ?)
         ON DUPLICATE KEY UPDATE
           kpi_personal = VALUES(kpi_personal),
           kpi_enterprise = VALUES(kpi_enterprise)`,
        [empId, row.personal, row.enterprise],
      );
    }
    console.log("[migrate] 2026-09 月度KPI种子数据已回填");

    // ─ 5. crm_employees 移除旧KPI列 ─
    const dropColumn = async (col: string) => {
      try { await dbPool.query(`ALTER TABLE crm_employees DROP COLUMN ${col}`); } catch { /* 列不存在则跳过 */ }
    };
    await dropColumn("kpi_target");
    await dropColumn("kpi_personal");
    await dropColumn("kpi_enterprise");
    console.log("[migrate] crm_employees 旧KPI列已移除");

    // ── 6. 删除 crm_invitation_codes 表 ──
    await dbPool.query("DROP TABLE IF EXISTS crm_invitation_codes");
    console.log("[migrate] crm_invitation_codes 表已删除");

    // ── 验证 ──
    const [verify] = await dbPool.query(
      `SELECT e.name, e.invitation_code, mk.kpi_personal, mk.kpi_enterprise
       FROM crm_employees e
       LEFT JOIN crm_monthly_kpi mk ON mk.employee_id = e.id AND mk.kpi_month = '2026-09'
       ORDER BY e.id`,
    );
    console.log("[migrate] 重构验证：");
    for (const r of verify as Array<{ name: string; invitation_code: string | null; kpi_personal: number; kpi_enterprise: number }>) {
      console.log(`  ${r.name} | 邀请码=${r.invitation_code ?? '无'} | 外贸员KPI=${r.kpi_personal ?? 0} | 企业KPI=${r.kpi_enterprise ?? 0}`);
    }
  },
};
