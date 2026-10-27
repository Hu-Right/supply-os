/**
 * 邀请码归因数据访问层
 * Invitation Code Attribution Repository
 *
 * 职责边界：仅承担「注册归因写入」一侧——邀请码校验（员工码 EMP- / 渠道码 CH- 两个命名空间
 * 按前缀分流）、注册完成后的月度实际完成数自增（incrementMonthlyActual），
 * 以及渠道注册台账的一人一行写入（recordChannelRegistration）。
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
 * employee 走 crm_monthly_kpi 累加列；channel 走 crm_channel_registrations 台账（一人一行）。
 */
export type CodeOwner =
  | { namespace: "employee"; employeeId: number }
  | { namespace: "channel"; code: string; partnerId: number };

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
       FROM crm_employees
       WHERE invitation_code = ? AND is_active = 1
       LIMIT 1`,
      [code],
    );
    return (rows as Array<{ employee_id: number; name: string; department: string | null; invitation_code: string }>)[0] ?? null;
  }

  /** 按渠道码查归属主体（码与主体必须同时在职，否则停用连坐失效） */
  async findChannelByCode(
    code: string,
  ): Promise<{ code: string; partner_id: number; partner_name: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT c.code, c.partner_id, p.name AS partner_name
       FROM crm_channel_codes c
       JOIN crm_channel_partners p ON p.id = c.partner_id
       WHERE c.code = ? AND c.is_active = 1 AND p.is_active = 1
       LIMIT 1`,
      [code],
    );
    return (rows as Array<{ code: string; partner_id: number; partner_name: string }>)[0] ?? null;
  }

  /**
   * 验证邀请码有效性并按前缀分流归因命名空间。
   * EMP- 及其余存量码走原 crm_employees 逻辑（一字不动）；CH- 只查渠道两张表。
   * 两边的失败文案分开：渠道商要靠这句话自查自己的推广链接是不是印错了。
   */
  async validateCode(code: string): Promise<{ valid: boolean; reason?: string; owner?: CodeOwner }> {
    const normalized = normalizeCode(code);

    if (isChannelCode(normalized)) {
      const channel = await this.findChannelByCode(normalized);
      if (!channel) return { valid: false, reason: "渠道邀请码无效或已停用" };
      return {
        valid: true,
        owner: { namespace: "channel", code: channel.code, partnerId: channel.partner_id },
      };
    }

    const record = await this.findByCode(normalized);
    if (!record) return { valid: false, reason: "邀请码不存在" };
    return { valid: true, owner: { namespace: "employee", employeeId: record.employee_id } };
  }

  /**
   * 渠道注册台账：一人一行。
   *
   * 幂等锚在 uk_channel_reg_user（user_id 唯一）+ ON DUPLICATE KEY UPDATE user_id = user_id：
   * 注册流程不是单事务（建号与归因分属两条自动提交），建号后任一步失败重试都拿着同一个
   * userId 补写；没有这道闸，重试会凭空多算一个人头。
   * partner_id 由调用方从码行带出（写账瞬间的主体快照），不在 SQL 里反查——事后改绑不影响已入账的账。
   */
  async recordChannelRegistration(input: { userId: number; code: string; partnerId: number }): Promise<void> {
    const userId = Number(input.userId);
    const partnerId = Number(input.partnerId);
    const code = normalizeCode(input.code);
    // 准入守卫在发 SQL 之前：拿着 0/NaN 去写账，等于用一条脏行占住未来的 user_id 名额
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error(`recordChannelRegistration: 非法 userId=${input.userId}（建号未成功不得写账）`);
    }
    if (!Number.isInteger(partnerId) || partnerId <= 0) {
      throw new Error(`recordChannelRegistration: 非法 partnerId=${input.partnerId}`);
    }
    if (!isChannelCode(code)) {
      throw new Error(`recordChannelRegistration: 非渠道码(${code})，员工码请走 incrementMonthlyActual`);
    }

    await this.pool.execute(
      `INSERT INTO crm_channel_registrations (user_id, code, partner_id, user_type, registered_at)
       VALUES (?, ?, ?, 'personal', NOW())
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId, code, partnerId],
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
      `INSERT INTO crm_monthly_kpi (employee_id, kpi_month, ${column})
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
      [employeeId, kpiMonth],
    );
  }
}
