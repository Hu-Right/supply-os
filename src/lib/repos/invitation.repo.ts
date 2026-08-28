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
   * 如果员工属于业绩组，同时返回组合并统计数据
   * 返回：员工信息 + 个人统计 + 组合并统计（如有）+ 个人最近注册用户列表
   */
  async getEmployeePerformance(employeeId: number): Promise<{
    employee: { id: number; name: string; department: string | null; performance_group: string | null };
    personal: {
      total_referrals: number;
      month_referrals: number;
    };
    group: {
      group_name: string;
      member_count: number;
      total_referrals: number;
      month_referrals: number;
      members: Array<{ id: number; name: string; total_referrals: number; month_referrals: number }>;
    } | null;
    recent_referrals: Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date }>;
  }> {
    // 员工基本信息（含业绩组）
    const [empRows] = await this.pool.query(
      "SELECT id, name, department, performance_group FROM crm_employees WHERE id = ? LIMIT 1",
      [employeeId],
    );
    const emp = (empRows as Array<{ id: number; name: string; department: string | null; performance_group: string | null }>)[0];
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

    // 最近 50 条个人推荐用户
    const [recentRows] = await this.pool.query(
      `SELECT user_key, email, display_name, created_at
       FROM crm_users
       WHERE referral_employee_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [employeeId],
    );

    // 业绩组合并统计
    let groupStats: {
      group_name: string;
      member_count: number;
      total_referrals: number;
      month_referrals: number;
      members: Array<{ id: number; name: string; total_referrals: number; month_referrals: number }>;
    } | null = null;

    if (emp.performance_group) {
      // 查询同组所有员工
      const [groupEmpRows] = await this.pool.query(
        "SELECT id, name FROM crm_employees WHERE performance_group = ? AND is_active = 1 ORDER BY id",
        [emp.performance_group],
      );
      const groupMembers = groupEmpRows as Array<{ id: number; name: string }>;

      if (groupMembers.length > 0) {
        const memberIds = groupMembers.map((m) => m.id);
        const placeholders = memberIds.map(() => "?").join(",");

        // 组合并总推荐数
        const [groupTotalRows] = await this.pool.query(
          `SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id IN (${placeholders})`,
          memberIds,
        );
        const groupTotal = Number((groupTotalRows as Array<{ total: number }>)[0]?.total || 0);

        // 组合并本月推荐数
        const [groupMonthRows] = await this.pool.query(
          `SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id IN (${placeholders}) AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
          memberIds,
        );
        const groupMonth = Number((groupMonthRows as Array<{ total: number }>)[0]?.total || 0);

        // 每个组员的个人统计
        const memberStats: Array<{ id: number; name: string; total_referrals: number; month_referrals: number }> = [];
        for (const member of groupMembers) {
          const [mTotalRows] = await this.pool.query(
            "SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id = ?",
            [member.id],
          );
          const mTotal = Number((mTotalRows as Array<{ total: number }>)[0]?.total || 0);

          const [mMonthRows] = await this.pool.query(
            "SELECT COUNT(*) AS total FROM crm_users WHERE referral_employee_id = ? AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')",
            [member.id],
          );
          const mMonth = Number((mMonthRows as Array<{ total: number }>)[0]?.total || 0);

          memberStats.push({ id: member.id, name: member.name, total_referrals: mTotal, month_referrals: mMonth });
        }

        groupStats = {
          group_name: emp.performance_group,
          member_count: groupMembers.length,
          total_referrals: groupTotal,
          month_referrals: groupMonth,
          members: memberStats,
        };
      }
    }

    return {
      employee: { id: emp.id, name: emp.name, department: emp.department, performance_group: emp.performance_group },
      personal: {
        total_referrals: personalTotal,
        month_referrals: personalMonth,
      },
      group: groupStats,
      recent_referrals: recentRows as Array<{ user_key: string; email: string | null; display_name: string | null; created_at: Date }>,
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
  async listAllWithEmployee(): Promise<Array<InvitationCodeRow & { employee_name: string; department: string | null; performance_group: string | null }>> {
    const [rows] = await this.pool.query(
      `SELECT ic.*, e.name AS employee_name, e.department, e.performance_group
       FROM crm_invitation_codes ic
       JOIN crm_employees e ON e.id = ic.employee_id
       ORDER BY ic.created_at DESC`,
    );
    return rows as Array<InvitationCodeRow & { employee_name: string; department: string | null; performance_group: string | null }>;
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
