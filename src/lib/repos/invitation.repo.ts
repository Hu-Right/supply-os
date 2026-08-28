/**
 * 邀请码数据访问层
 * Invitation Code Repository
 *
 * @module repos/invitation.repo
 */
import type { Pool } from "mysql2/promise";
import type { InvitationCodeRow } from "./types";

/** 生成随机邀请码：EMP-XXXXXXXX（8位大写字母数字） */
function generateInvitationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字符 0/1/I/O
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EMP-${code}`;
}

export class InvitationRepo {
  constructor(private pool: Pool) {}

  /** 按邀请码查询（含员工姓名） */
  async findByCode(code: string): Promise<(InvitationCodeRow & { employee_name: string }) | null> {
    const [rows] = await this.pool.query(
      `SELECT ic.*, e.name AS employee_name
       FROM crm_invitation_codes ic
       JOIN crm_employees e ON e.id = ic.employee_id
       WHERE ic.code = ?
       LIMIT 1`,
      [code],
    );
    return (rows as (InvitationCodeRow & { employee_name: string })[])[0] ?? null;
  }

  /**
   * 验证邀请码有效性：存在 + 启用 + 未过期 + 未超使用上限
   * @returns valid=false 时 reason 包含人类可读的原因
   */
  async validateCode(code: string): Promise<{ valid: boolean; reason?: string; employee_id?: number }> {
    const record = await this.findByCode(code);
    if (!record) return { valid: false, reason: "邀请码不存在" };
    if (!record.is_active) return { valid: false, reason: "邀请码已停用" };
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return { valid: false, reason: "邀请码已过期" };
    }
    if (record.max_uses !== null && record.used_count >= record.max_uses) {
      return { valid: false, reason: "邀请码已达使用上限" };
    }
    return { valid: true, employee_id: record.employee_id };
  }

  /** 使用邀请码：used_count + 1 */
  async incrementUsedCount(code: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_invitation_codes SET used_count = used_count + 1 WHERE code = ?",
      [code],
    );
  }

  /**
   * 按员工 ID 查询业绩概览
   * 返回：员工信息（含 KPI 目标）+ 个人统计 + 完成进度 + 最近注册用户列表
   */
  async getEmployeePerformance(employeeId: number): Promise<{
    employee: { id: number; name: string; department: string | null; kpi_target: number | null };
    personal: {
      total_referrals: number;
      month_referrals: number;
      personal_count: number;    // 个人注册数
      enterprise_count: number;  // 企业注册数
      completion_rate: number;
    };
    recent_referrals: Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date; user_type: string }>;
  }> {
    // 员工基本信息（含 KPI 目标）
    const [empRows] = await this.pool.query(
      "SELECT id, name, department, kpi_target FROM crm_employees WHERE id = ? LIMIT 1",
      [employeeId],
    );
    const emp = (empRows as Array<{ id: number; name: string; department: string | null; kpi_target: number | null }>)[0];
    if (!emp) throw new Error(`Employee ${employeeId} not found`);

    // 个人总推荐数
    const [totalRows] = await this.pool.query(
      "SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id = ?",
      [employeeId],
    );
    const personalTotal = Number((totalRows as Array<{ total: number }>)[0]?.total || 0);

    // 个人本月推荐数
    const [monthRows] = await this.pool.query(
      "SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id = ? AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')",
      [employeeId],
    );
    const personalMonth = Number((monthRows as Array<{ total: number }>)[0]?.total || 0);

    // 完成率
    const completionRate = emp.kpi_target ? Math.round((personalTotal / emp.kpi_target) * 100) : 0;

    // 个人注册数 vs 企业注册数
    const [typeRows] = await this.pool.query(
      `SELECT user_type, COUNT(*) AS cnt FROM crm_users WHERE referral_employee_id = ? GROUP BY user_type`,
      [employeeId],
    );
    let personalCount = 0;
    let enterpriseCount = 0;
    for (const row of typeRows as Array<{ user_type: string; cnt: string | number }>) {
      if (row.user_type === "personal") personalCount = Number(row.cnt);
      else enterpriseCount = Number(row.cnt);
    }

    // 最近 50 条个人推荐用户
    const [recentRows] = await this.pool.query(
      `SELECT user_key, email, display_name, created_at, user_type
       FROM crm_users
       WHERE referral_employee_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [employeeId],
    );

    return {
      employee: { id: emp.id, name: emp.name, department: emp.department, kpi_target: emp.kpi_target },
      personal: {
        total_referrals: personalTotal,
        month_referrals: personalMonth,
        personal_count: personalCount,
        enterprise_count: enterpriseCount,
        completion_rate: completionRate,
      },
      recent_referrals: recentRows as Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date; user_type: string }>,
    };
  }

  /** 按员工统计推荐数据（支持时间段，管理员用） */
  async getReferralStatsByEmployee(
    employeeId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ total: number }> {
    let sql = "SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id = ?";
    const params: unknown[] = [employeeId];

    if (startDate) {
      sql += " AND created_at >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND created_at <= ?";
      params.push(endDate);
    }

    const [rows] = await this.pool.query(sql, params);
    return { total: Number((rows as Array<{ total: number }>)[0]?.total || 0) };
  }

  /** 管理员：列出所有邀请码（含员工信息和使用统计） */
  async listAllWithEmployee(): Promise<Array<InvitationCodeRow & { employee_name: string; department: string | null; kpi_target: number | null }>> {
    const [rows] = await this.pool.query(
      `SELECT ic.*, e.name AS employee_name, e.department, e.kpi_target
       FROM crm_invitation_codes ic
       JOIN crm_employees e ON e.id = ic.employee_id
       ORDER BY ic.created_at DESC`,
    );
    return rows as Array<InvitationCodeRow & { employee_name: string; department: string | null; kpi_target: number | null }>;
  }

  /**
   * 管理员：创建邀请码
   * @returns 生成的邀请码字符串
   */
  async create(data: { employee_id: number; max_uses?: number; expires_at?: Date }): Promise<string> {
    // 生成唯一邀请码（最多重试 10 次避免碰撞）
    let code = generateInvitationCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const [existing] = await this.pool.query(
        "SELECT id FROM crm_invitation_codes WHERE code = ? LIMIT 1",
        [code],
      );
      if ((existing as unknown[]).length === 0) break;
      code = generateInvitationCode();
    }

    await this.pool.execute(
      `INSERT INTO crm_invitation_codes (code, employee_id, max_uses, expires_at)
       VALUES (?, ?, ?, ?)`,
      [code, data.employee_id, data.max_uses ?? null, data.expires_at ?? null],
    );

    return code;
  }

  /** 管理员：停用/启用邀请码 */
  async toggleActive(id: number, active: boolean): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_invitation_codes SET is_active = ? WHERE id = ?",
      [active ? 1 : 0, id],
    );
  }
}
