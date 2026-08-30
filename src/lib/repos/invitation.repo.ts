/**
 * 邀请码归因数据访问层
 * Invitation Code Attribution Repository
 *
 * 职责边界：仅承担「注册归因写入」一侧——邀请码校验与注册完成后的
 * 月度实际完成数自增（incrementMonthlyActual）。
 * 员工业绩/KPI 的查询与展示由独立 CRM 系统负责，本仓库不再提供任何
 * 业绩查看接口。
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

  /**
   * 注册时调用：当月实际完成数 +1
   * 如果当月记录不存在则自动创建（目标值由外部 CRM 维护，首次为0）
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
}
