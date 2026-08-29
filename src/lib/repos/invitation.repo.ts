/**
 * 邀请码与月度KPI数据访问层
 * Invitation Code & Monthly KPI Repository
 *
 * @module repos/invitation.repo
 */
import type { Pool } from "mysql2/promise";

/** 获取当前月份字符串 'YYYY-MM' */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class InvitationRepo {
  constructor(private pool: Pool) {}

  // ──────────────────────────────────────────────
  //  邀请码（直接从 crm_employees 查询）
  // ──────────────────────────────────────────────

  /** 按邀请码查询员工 */
  async findByCode(code: string): Promise<{ employee_id: number; name: string; department: string | null; invitation_code: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT id AS employee_id, name, department, invitation_code
       FROM crm_employees
       WHERE invitation_code = ? AND is_active = 1
       LIMIT 1`,
      [code],
    );
    return (rows as Array<{ employee_id: number; name: string; department: string | null; invitation_code: string }>)[0] ?? null;
  }

  /** 验证邀请码有效性 */
  async validateCode(code: string): Promise<{ valid: boolean; reason?: string; employee_id?: number }> {
    const record = await this.findByCode(code);
    if (!record) return { valid: false, reason: "邀请码不存在" };
    return { valid: true, employee_id: record.employee_id };
  }

  // ──────────────────────────────────────────────
  //  月度 KPI
  // ──────────────────────────────────────────────

  /**
   * 注册时调用：当月实际完成数 +1
   * 如果当月记录不存在则自动创建（目标值从种子数据继承，首次为0）
   */
  async incrementMonthlyActual(employeeId: number, userType: "personal" | "enterprise", month?: string): Promise<void> {
    const kpiMonth = month ?? currentMonth();
    const column = userType === "personal" ? "actual_personal" : "actual_enterprise";
    await this.pool.execute(
      `INSERT INTO crm_monthly_kpi (employee_id, kpi_month, ${column})
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
      [employeeId, kpiMonth],
    );
  }

  /** 查询指定月份的KPI记录 */
  async getMonthlyKpi(employeeId: number, month?: string): Promise<MonthlyKpiData | null> {
    const kpiMonth = month ?? currentMonth();
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_monthly_kpi WHERE employee_id = ? AND kpi_month = ? LIMIT 1`,
      [employeeId, kpiMonth],
    );
    return (rows as MonthlyKpiData[])[0] ?? null;
  }

  /** 设置指定月份的KPI目标 */
  async setMonthlyTarget(employeeId: number, month: string, kpiPersonal: number, kpiEnterprise: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_monthly_kpi (employee_id, kpi_month, kpi_personal, kpi_enterprise)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         kpi_personal = VALUES(kpi_personal),
         kpi_enterprise = VALUES(kpi_enterprise)`,
      [employeeId, month, kpiPersonal, kpiEnterprise],
    );
  }

  // ──────────────────────────────────────────────
  //  业绩概览 & 排行榜
  // ──────────────────────────────────────────────

  /**
   * 按员工 ID 查询业绩概览（指定月份，默认当月）
   */
  async getEmployeePerformance(employeeId: number, month?: string): Promise<{
    employee: { id: number; name: string; department: string | null; invitation_code: string | null };
    kpi_month: string;
    targets: { personal: number; enterprise: number; total: number };
    actuals: { personal: number; enterprise: number; total: number };
    completion: { personal_rate: number; enterprise_rate: number; total_rate: number };
    recent_referrals: Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date; user_type: string }>;
  }> {
    const kpiMonth = month ?? currentMonth();

    // 员工基本信息
    const [empRows] = await this.pool.query(
      "SELECT id, name, department, invitation_code FROM crm_employees WHERE id = ? LIMIT 1",
      [employeeId],
    );
    const emp = (empRows as Array<{ id: number; name: string; department: string | null; invitation_code: string | null }>)[0];
    if (!emp) throw new Error(`Employee ${employeeId} not found`);

    // 月度KPI
    const kpi = await this.getMonthlyKpi(employeeId, kpiMonth);
    const kpiPersonal = kpi?.kpi_personal ?? 0;
    const kpiEnterprise = kpi?.kpi_enterprise ?? 0;
    const actualPersonal = kpi?.actual_personal ?? 0;
    const actualEnterprise = kpi?.actual_enterprise ?? 0;

    // 完成率
    const personalRate = kpiPersonal ? Math.round((actualPersonal / kpiPersonal) * 100) : 0;
    const enterpriseRate = kpiEnterprise ? Math.round((actualEnterprise / kpiEnterprise) * 100) : 0;
    const totalRate = (kpiPersonal + kpiEnterprise) ? Math.round(((actualPersonal + actualEnterprise) / (kpiPersonal + kpiEnterprise)) * 100) : 0;

    // 最近注册用户
    const [recentRows] = await this.pool.query(
      `SELECT user_key, email, display_name, created_at, user_type
       FROM crm_users
       WHERE referral_employee_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [employeeId, kpiMonth],
    );

    return {
      employee: { id: emp.id, name: emp.name, department: emp.department, invitation_code: emp.invitation_code },
      kpi_month: kpiMonth,
      targets: { personal: kpiPersonal, enterprise: kpiEnterprise, total: kpiPersonal + kpiEnterprise },
      actuals: { personal: actualPersonal, enterprise: actualEnterprise, total: actualPersonal + actualEnterprise },
      completion: { personal_rate: personalRate, enterprise_rate: enterpriseRate, total_rate: totalRate },
      recent_referrals: recentRows as Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date; user_type: string }>,
    };
  }

  /**
   * 管理员：全员推荐排行榜（指定月份，默认当月）
   */
  async getLeaderboard(month?: string): Promise<Array<{
    employee_id: number;
    employee_name: string;
    department: string | null;
    invitation_code: string | null;
    kpi_month: string;
    targets: { personal: number; enterprise: number; total: number };
    actuals: { personal: number; enterprise: number; total: number };
    completion: { personal_rate: number; enterprise_rate: number; total_rate: number };
  }>> {
    const kpiMonth = month ?? currentMonth();

    const [rows] = await this.pool.query(
      `SELECT
         e.id AS employee_id,
         e.name AS employee_name,
         e.department,
         e.invitation_code,
         COALESCE(mk.kpi_personal, 0) AS kpi_personal,
         COALESCE(mk.kpi_enterprise, 0) AS kpi_enterprise,
         COALESCE(mk.actual_personal, 0) AS actual_personal,
         COALESCE(mk.actual_enterprise, 0) AS actual_enterprise
       FROM crm_employees e
       LEFT JOIN crm_monthly_kpi mk ON mk.employee_id = e.id AND mk.kpi_month = ?
       WHERE e.is_active = 1
       ORDER BY (COALESCE(mk.actual_personal, 0) + COALESCE(mk.actual_enterprise, 0)) DESC`,
      [kpiMonth],
    );

    return (rows as Array<Record<string, unknown>>).map((r) => {
      const kpiP = Number(r.kpi_personal || 0);
      const kpiE = Number(r.kpi_enterprise || 0);
      const actP = Number(r.actual_personal || 0);
      const actE = Number(r.actual_enterprise || 0);
      return {
        employee_id: Number(r.employee_id),
        employee_name: r.employee_name as string,
        department: r.department as string | null,
        invitation_code: (r.invitation_code as string) || null,
        kpi_month: kpiMonth,
        targets: { personal: kpiP, enterprise: kpiE, total: kpiP + kpiE },
        actuals: { personal: actP, enterprise: actE, total: actP + actE },
        completion: {
          personal_rate: kpiP ? Math.round((actP / kpiP) * 100) : 0,
          enterprise_rate: kpiE ? Math.round((actE / kpiE) * 100) : 0,
          total_rate: (kpiP + kpiE) ? Math.round(((actP + actE) / (kpiP + kpiE)) * 100) : 0,
        },
      };
    });
  }

  /**
   * 管理员：列出所有员工及邀请码
   */
  async listAllEmployees(): Promise<Array<{
    employee_id: number;
    name: string;
    department: string | null;
    invitation_code: string | null;
    is_active: number;
  }>> {
    const [rows] = await this.pool.query(
      `SELECT id AS employee_id, name, department, invitation_code, is_active
       FROM crm_employees
       ORDER BY id`,
    );
    return rows as Array<{
      employee_id: number;
      name: string;
      department: string | null;
      invitation_code: string | null;
      is_active: number;
    }>;
  }
}

interface MonthlyKpiData {
  id: number;
  employee_id: number;
  kpi_month: string;
  kpi_personal: number;
  kpi_enterprise: number;
  actual_personal: number;
  actual_enterprise: number;
  created_at: Date;
  updated_at: Date | null;
}
