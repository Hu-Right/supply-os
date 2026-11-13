/**
 * 邀请码归因数据访问层
 * Invitation Code Attribution Repository
 *
 * 职责边界：仅承担「注册归因写入」一侧——邀请码校验（员工码 EMP- / 渠道码 CH- 两个命名空间
 * 按前缀分流）、注册完成后的月度实际完成数自增（incrementMonthlyActual），
 * 以及渠道归因写入（setChannelInviteCode：归因直接落在 users.invite_code 列上）。
 * 员工业绩/KPI 的查询与展示由独立 CRM 系统负责，本仓库不再提供任何
 * 业绩查看接口。
 *
 * @module repos/invitation.repo
 */
import type { Pool } from "mysql2/promise";

/**
 * 渠道码命名空间前缀。事实源是 CRM 仓库 packages/contracts/src/channel.ts 的 CHANNEL_CODE_PREFIX；
 * 两仓库无 workspace 链接，此处为字面副本——改一侧必须同步另一侧，否则 CRM 发出去的码门户一律判无效。
 */
const CHANNEL_CODE_PREFIX = "CH-";

/** 本 repo 依赖的池形状（单测注假池用，口径同 benefit-write.repo 的 Db） */
export type PoolLike = Pick<Pool, "query" | "execute">;

/**
 * 归因主体：两个命名空间互斥，不做双向 fallback（一个码只可能属于一个命名空间）。
 * employee 走 monthly_kpi 累加列；channel 走 users.invite_code 归因列（2026-11-12 二段：
 * channel_registrations 台账表已删除，归因就是用户本体行上的一个列）。
 */
export type CodeOwner =
  | { namespace: "employee"; employeeId: number }
  | { namespace: "channel"; code: string };

/** 获取当前月份字符串 'YYYY-MM' */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 邀请码大小写不敏感：落地页 Cookie 里的码可能已被用户/浏览器改过大小写 */
function normalizeCode(code: string): string {
  return String(code ?? "").trim().toUpperCase();
}

function isChannelCode(code: string): boolean {
  return code.startsWith(CHANNEL_CODE_PREFIX);
}

export class InvitationRepo {
  constructor(private pool: PoolLike) {}

  /** 按邀请码查询员工 */
  async findByCode(code: string): Promise<{ employee_id: number; name: string; department: string | null; invitation_code: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT id AS employee_id, name, department, invitation_code
       FROM employees
       WHERE invitation_code = ? AND is_active = 1
       LIMIT 1`,
      [code],
    );
    return (rows as Array<{ employee_id: number; name: string; department: string | null; invitation_code: string }>)[0] ?? null;
  }

  /**
   * 按渠道码查归属主体（码即主体）。
   * 2026-11-12 合并（CRM 仓库 channel-partner/schema.ts 自迁移）：主体与邀请码同在
   * channel_partners 一张表，一行一个渠道商（invite_code 唯一），channel_codes 已删。
   * 2026-11-12 二段：channel_registrations 台账也已删，校验只回答「码是否有效」，
   * 归属关系由 CRM 侧按 users.invite_code 关联，门户不再关心 partner_id。
   * 停用语义收敛为主体一个 is_active——码即主体，没有第二个开关。
   */
  async findChannelByCode(code: string): Promise<{ code: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT invite_code AS code
       FROM channel_partners
       WHERE invite_code = ? AND is_active = 1
       LIMIT 1`,
      [code],
    );
    return (rows as Array<{ code: string }>)[0] ?? null;
  }

  /**
   * 验证邀请码有效性并按前缀分流归因命名空间。
   * EMP- 及其余存量码走原 employees 逻辑（一字不动）；CH- 只查 channel_partners
   * 单表（码即主体）。两边的失败文案分开：渠道商要靠这句话自查自己的推广链接是不是印错了。
   */
  async validateCode(code: string): Promise<{ valid: boolean; reason?: string; owner?: CodeOwner }> {
    const normalized = normalizeCode(code);

    if (isChannelCode(normalized)) {
      const channel = await this.findChannelByCode(normalized);
      if (!channel) return { valid: false, reason: "渠道邀请码无效或已停用" };
      return {
        valid: true,
        owner: { namespace: "channel", code: channel.code },
      };
    }

    const record = await this.findByCode(normalized);
    if (!record) return { valid: false, reason: "邀请码不存在" };
    return { valid: true, owner: { namespace: "employee", employeeId: record.employee_id } };
  }

  /**
   * 渠道归因写入：把注册用的渠道码落在用户本体行的 invite_code 列上。
   *
   * 幂等天然成立：一行一个用户，重试重复执行同一 UPDATE 写回同一值，不会多算人头
   * （不再需要旧台账 uk_channel_reg_user + ON DUPLICATE KEY 那道闸）。
   * 注册类型/注册时间不在此写：personal 起步与 created_at 都在 users 行上，CRM 侧直接读。
   * channel_registrations 台账已于 2026-11-12 删除（CRM 侧迁移脚本 channel-users-merge-20261112.mjs）。
   */
  async setChannelInviteCode(input: { userId: number; code: string }): Promise<void> {
    const userId = Number(input.userId);
    const code = normalizeCode(input.code);
    // 准入守卫在发 SQL 之前：拿着 0/NaN 去写归因，等于把未来用户的行污染成渠道用户
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error(`setChannelInviteCode: 非法 userId=${input.userId}（建号未成功不得写归因）`);
    }
    if (!isChannelCode(code)) {
      throw new Error(`setChannelInviteCode: 非渠道码(${code})，员工码请走 incrementMonthlyActual`);
    }

    await this.pool.execute(
      `UPDATE users SET invite_code = ? WHERE id = ?`,
      [code, userId],
    );
  }

  /**
   * 注册时调用：当月实际完成数 +1
   * 如果当月记录不存在则自动创建（目标值由外部 CRM 维护，首次为0）
   */
  async incrementMonthlyActual(employeeId: number, userType: "personal" | "enterprise", month?: string): Promise<void> {
    const kpiMonth = month ?? currentMonth();
    const column = userType === "personal" ? "actual_personal" : "actual_enterprise";
    await this.pool.execute(
      `INSERT INTO monthly_kpi (employee_id, kpi_month, ${column})
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
      [employeeId, kpiMonth],
    );
  }
}
