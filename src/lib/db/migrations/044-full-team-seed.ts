/**
 * 044: 补全全员种子数据 + 预生成邀请码
 * full-team-seed
 *
 * 补全 6 人团队员工记录（小曹/甜甜/于雷/李建森/王超），
 * 并为全员预生成邀请码。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 全员 KPI 目标（来自 9.1-9.30 KPI 分配表） */
const TEAM = [
  { name: "小曹", department: "账号运营", kpi: 510, code: "EMP-XCAO26A1" },
  { name: "甜甜", department: "小红书运营", kpi: 310, code: "EMP-TIAN26B2" },
  { name: "于雷", department: "账号+直播运营", kpi: 700, code: "EMP-YULE26C3" },
  { name: "啊历", department: "私域运营", kpi: 518, code: "EMP-ALI260D4" },
  { name: "许丹", department: "私域运营", kpi: 222, code: "EMP-XUDN26E5" },
  { name: "李建森", department: "销售+主播", kpi: 1070, code: "EMP-LJSEN6F7" },
  { name: "王超", department: "销售", kpi: 670, code: "EMP-WCHA26G8" },
] as const;

export const migration: Migration = {
  version: 44,
  name: "full-team-seed",
  async up(dbPool: Pool) {
    // ── 1. 补全/更新员工记录 ─
    const employeeValues = TEAM.map((e) => `('${e.name}', '${e.department}', ${e.kpi})`).join(",\n       ");
    await dbPool.query(`
      INSERT INTO crm_employees (name, department, kpi_target)
      VALUES ${employeeValues}
      ON DUPLICATE KEY UPDATE
        department = VALUES(department),
        kpi_target = VALUES(kpi_target)
    `);
    console.log(`[seeds] crm_employees 全员 ${TEAM.length} 人已就绪`);

    // ── 2. 查询员工 ID 映射 ──
    const [empRows] = await dbPool.query(
      "SELECT id, name FROM crm_employees",
    );
    const empMap = new Map<string, number>();
    for (const row of empRows as Array<{ id: number; name: string }>) {
      empMap.set(row.name, row.id);
    }

    // ── 3. 为每人预生成邀请码（INSERT IGNORE，幂等）──
    for (const member of TEAM) {
      const employeeId = empMap.get(member.name);
      if (!employeeId) {
        console.warn(`[seeds] 未找到员工 "${member.name}"，跳过邀请码生成`);
        continue;
      }
      await dbPool.execute(
        `INSERT IGNORE INTO crm_invitation_codes (code, employee_id, is_active)
         VALUES (?, ?, 1)`,
        [member.code, employeeId],
      );
    }
    console.log(`[seeds] crm_invitation_codes 全员邀请码已生成`);

    // ── 打印邀请码清单 ──
    const [codeRows] = await dbPool.query(
      `SELECT ic.code, e.name, e.department, e.kpi_target
       FROM crm_invitation_codes ic
       JOIN crm_employees e ON e.id = ic.employee_id
       ORDER BY e.id`,
    );
    console.log("[seeds] 邀请码清单：");
    for (const row of codeRows as Array<{ code: string; name: string; department: string; kpi_target: number }>) {
      console.log(`  ${row.name}（${row.department}，KPI=${row.kpi_target}）→ ${row.code}`);
    }
  },
};
