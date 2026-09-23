/**
 * 权益体系读层（阶段二·地基）
 * Benefit System Repository (read side)
 *
 * @module repos/benefit-system.repo
 * @description 数据源**只有**迁移 092 建的 8 张权益体系表：
 *              crm_benefit_catalog / crm_plan_catalog / crm_plan_benefits
 *              crm_plan_subscriptions / crm_benefit_quotas / crm_subscription_seats。
 *
 *              纪律（勿加回来）：
 *              - 不读写旧三表（crm_membership_plans / crm_user_subscriptions /
 *                crm_user_entitlements），也不设"旧 feature key → 新权益码"的翻译层：
 *                矩阵一行一格 + level_dict 存 docx 单元格原文，本身就是完整表述；
 *              - 不存在"档位数字"概念：门控判定按权益自身的 value_kind 取值比较
 *                （bool 看 0/1、enum 看是否 >0、quota 看 -1/0/正数、amount 看是否包含）；
 *              - 额度**扣减**不在本模块：扣减路径在 unlock-quota.ts（已切新账本），
 *                履约/退款写入在 benefit-write.repo.ts（已与支付回调双轨接线：
 *                新目录码只走新表组）；本模块只提供读取、判定与对比表渲染所需的值。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { BenefitDefRow, PlanCatalogRow, MatrixCellRow, ResolvedCell, ActivePlanRow, QuotaBalanceRow, GateState, ComparisonTable } from "@/types/membership";

/**
 * 未订阅基线档位码：`free` 列是价格文档「普通用户」列的逐字录入，
 * 未订阅用户能享到什么，唯一事实源就是这一列（见 isEntitled）。
 */
export const FREE_PLAN_CODE = "free";

/**
 * 把一格原始值解析成"是否享有 + 展示原文"。纯函数，便于单测与前端复用。
 * 取值口径与库内注释一一对应，不做任何跨体系换算。
 *
 * 异常值一律标 `∅` 而不是编一个能看的文案：枚举行超出 level_dict 的层级、
 * amount 行缺 value_amount，都是"矩阵/字典存不一致"，必须浮出来让人补值；
 * 拿整数或"包含"去兜底，会把数据缺陷变成官网上一句看不出来的错话。
 */
export function resolveCell(
  def: Pick<BenefitDefRow, "benefit_code" | "value_kind" | "level_dict">,
  cell: MatrixCellRow,
): ResolvedCell {
  const kind = def.value_kind;
  const base = { plan_code: cell.plan_code, benefit_code: cell.benefit_code, kind };

  if (kind === "bool") {
    const level = Number(cell.value_level ?? 0);
    return { ...base, kind, raw: level, enabled: level > 0, display: level >= 1 ? "✓" : "—", note: cell.note_zh };
  }

  if (kind === "enum") {
    const level = Number(cell.value_level ?? 0);
    const text = def.level_dict?.[String(level)];
    if (text === undefined) {
      return {
        ...base,
        raw: level,
        // 层级 >0 是矩阵明说了的"该档有此权益"，门控不因展示无法渲染而误拒
        enabled: level > 0,
        display: "∅",
        note: `枚举越界：level_dict 无层级 ${level} 的文档原文，必须补字典项（不得拿整数充当文案）`,
      };
    }
    return { ...base, raw: level, enabled: level > 0, display: text, note: cell.note_zh };
  }

  if (kind === "quota") {
    const num = Number(cell.value_num ?? 0);
    return {
      ...base,
      raw: num,
      // 0 = 该档明确无额度（如普通用户 0 条）；-1 = 不限；正数 = 有额度
      enabled: num !== 0,
      display: num === -1 ? "不限" : num === 0 ? "—" : String(num),
      note: cell.note_zh,
    };
  }

  if (cell.value_amount === null || cell.value_amount === undefined) {
    return {
      ...base,
      raw: "0.00",
      enabled: false,
      display: "∅",
      note: "amount 行缺 value_amount：与 chk_one_value 矛盾，必须显式补值（0.00 才是「包含」）",
    };
  }
  const amount = Number(cell.value_amount);
  return {
    ...base,
    raw: cell.value_amount,
    // 金额行有值即"该档可按此价获得"（0.00=包含，正数=会员价），不存跨档换算
    enabled: true,
    display: amount === 0 ? "包含" : `¥${amount.toFixed(2)}`,
    note: cell.note_zh,
  };
}

export class BenefitSystemRepo {
  constructor(private pool: Pool | PoolConnection) {}

  /** 在售套餐（含 free 行的排除：free 不售卖，is_active=0） */
  async listActivePlans(): Promise<PlanCatalogRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT plan_code, name_en, name_zh, positioning_zh, price, price_mode, price_incl_tax, currency,
              billing_period_days, seat_limit, commercial_tier, cta_i18n_key, badge, sort_order, is_active
         FROM crm_plan_catalog WHERE is_active = 1 ORDER BY sort_order`,
    );
    return rows as PlanCatalogRow[];
  }

  /**
   * 按码取单个套餐，**不过滤 is_active**：履约需要区分"目录里根本没这个码"
   * 与"码存在但已下架/不可自助成交"，两者对客户与对账的含义不同。
   */
  async getPlan(planCode: string): Promise<PlanCatalogRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT plan_code, name_en, name_zh, positioning_zh, price, price_mode, price_incl_tax, currency,
              billing_period_days, seat_limit, commercial_tier, cta_i18n_key, badge, sort_order, is_active
         FROM crm_plan_catalog WHERE plan_code = ? LIMIT 1`,
      [planCode],
    );
    return (rows as PlanCatalogRow[])[0] ?? null;
  }

  /** 启用的权益定义（矩阵行序 = group_code + sort_order） */
  async listBenefits(): Promise<BenefitDefRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT benefit_code, name_zh, group_code, value_kind, level_dict, is_consumable,
              requires_subscription, gate_key, sort_order
         FROM crm_benefit_catalog WHERE is_active = 1 ORDER BY group_code, sort_order`,
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      level_dict: typeof r.level_dict === "string" ? JSON.parse(r.level_dict) : (r.level_dict as Record<string, string> | null),
    })) as BenefitDefRow[];
  }

  /** 按套餐取全部格子（一次查询，供详情页/对比表/后台编辑器复用） */
  async loadCells(planCodes?: string[]): Promise<MatrixCellRow[]> {
    const params: unknown[] = [];
    let where = "";
    if (planCodes && planCodes.length > 0) {
      where = `WHERE plan_code IN (${planCodes.map(() => "?").join(",")})`;
      params.push(...planCodes);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT plan_code, benefit_code, value_level, value_num, value_amount, note_zh
         FROM crm_plan_benefits ${where} ORDER BY plan_code, benefit_code`,
      params,
    );
    return rows as MatrixCellRow[];
  }

  /**
   * 组装对比表：行=权益、列=套餐，每格给"是否享有 + 原文展示 + 边界说明"。
   * 缺格不静默补默认值——直接在该格标 `∅`，由调用方按不完整处理（矩阵必须显式全填）。
   */
  async buildComparisonTable(includeFree = false): Promise<ComparisonTable> {
    const [plans, defs, cells] = await Promise.all([this.listActivePlans(), this.listBenefits(), this.loadCells()]);
    const free = includeFree ? await this.getPlan(FREE_PLAN_CODE) : null;
    // 免费档不售卖、不进官网六卡：两条分支都以「排除 free」为基线，仅 includeFree 时再显式前置取回，
    // 不依赖 listActivePlans 的 is_active 过滤兜底（防目录脏数据让 free 漏进官网）。
    const shownPlans = free ? [free, ...plans.filter((p) => p.plan_code !== FREE_PLAN_CODE)] : plans.filter((p) => p.plan_code !== FREE_PLAN_CODE);
    const byKey = new Map(cells.map((c) => [`${c.plan_code}|${c.benefit_code}`, c]));
    const planCodes = shownPlans.map((p) => p.plan_code);

    const rows = defs.map((benefit) => {
      const out: Record<string, ResolvedCell> = {};
      for (const planCode of planCodes) {
        const cell = byKey.get(`${planCode}|${benefit.benefit_code}`);
        out[planCode] = cell
          ? resolveCell(benefit, cell)
          : {
              plan_code: planCode,
              benefit_code: benefit.benefit_code,
              kind: benefit.value_kind,
              raw: 0,
              enabled: false,
              display: "∅",
              note: "矩阵缺格：该套餐未声明此权益，必须显式补值",
            };
      }
      return { benefit, cells: out };
    });
    return { plans: shownPlans, rows };
  }

  /**
   * 解析用户当前生效套餐：本人订阅 + 作为他人席位成员的订阅，取目录横向序最高的一档。
   * 无生效订阅返回 null —— 调用方按"普通用户"处理（享 requires_subscription=0 的权益）。
   */
  async findActivePlanForUser(userId: number): Promise<ActivePlanRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT x.*
         FROM (
           SELECT s.id AS subscription_id, s.owner_user_id, s.plan_code, s.seat_limit, s.expires_at,
                  'owner' AS seat_role, p.sort_order, s.started_at, s.source_order_no, s.price_paid, s.currency
             FROM crm_plan_subscriptions s
             JOIN crm_plan_catalog p ON p.plan_code = s.plan_code
            WHERE s.owner_user_id = ? AND s.status = 'active'
              AND (s.expires_at IS NULL OR s.expires_at > NOW())
           UNION ALL
           SELECT s.id, s.owner_user_id, s.plan_code, s.seat_limit, s.expires_at, 'member', p.sort_order,
                             s.started_at, s.source_order_no, s.price_paid, s.currency
             FROM crm_subscription_seats st
             JOIN crm_plan_subscriptions s ON s.id = st.subscription_id
             JOIN crm_plan_catalog p ON p.plan_code = s.plan_code
            WHERE st.member_user_id = ? AND st.status = 'active' AND st.is_owner = 0
              AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
         ) x
        ORDER BY x.sort_order DESC, x.subscription_id DESC
        LIMIT 1`,
      [userId, userId],
    );
    return (rows as ActivePlanRow[])[0] ?? null;
  }

  /** 某套餐对某权益的取值（未定义该格时返回 null，不猜默认值） */
  async getCell(planCode: string, benefitCode: string): Promise<ResolvedCell | null> {
    const [def, cells] = await Promise.all([this.getBenefit(benefitCode), this.loadCells([planCode])]);
    if (!def) return null;
    const cell = cells.find((c) => c.benefit_code === benefitCode);
    return cell ? resolveCell(def, cell) : null;
  }

  async getBenefit(benefitCode: string): Promise<BenefitDefRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT benefit_code, name_zh, group_code, value_kind, level_dict, is_consumable,
              requires_subscription, gate_key, sort_order
         FROM crm_benefit_catalog WHERE benefit_code = ? AND is_active = 1`,
      [benefitCode],
    );
    const r = (rows as Array<Record<string, unknown>>)[0];
    if (!r) return null;
    return {
      ...r,
      level_dict: typeof r.level_dict === "string" ? JSON.parse(r.level_dict) : (r.level_dict as Record<string, string> | null),
    } as BenefitDefRow;
  }

  /**
   * 门控判定：该用户能否使用某权益。这是全库唯一门控入口——调用方不得再自行拼装档位比较。
   *
   * 未登录与"无生效订阅"一律读 `free` 档那一列（价格文档「普通用户」列的逐字录入），
   * 它是唯一的未订阅基线事实源。
   *
   * 修订缘由（2026-09-22，真库数据暴露）：此前按 `requires_subscription = 0` 直接判可用，
   * 会误放 `tech_support`、`procurement_consult`——两行 `requires_subscription` 为 0，
   * 但全档额度都是 0，按旧逻辑未订阅用户被判"可用"而实际一条也用不到。
   * 故 `requires_subscription` 退回为描述性字段（该权益是否需要订阅才可能享有），不再参与判定。
   * 缺格不猜默认值：矩阵未声明即判不享有。
   */
  async isEntitled(userId: number | null, benefitCode: string): Promise<boolean> {
    const def = await this.getBenefit(benefitCode);
    if (!def) return false;

    const plan = userId ? await this.findActivePlanForUser(userId) : null;
    const cells = await this.loadCells([plan?.plan_code ?? FREE_PLAN_CODE]);
    const cell = cells.find((c) => c.benefit_code === benefitCode);
    return cell ? resolveCell(def, cell).enabled : false;
  }

  /**
   * 用户当前生效档位在某枚举行上的层级（未订阅一律按 free 档）。
   *
   * 只服务 bool/enum 行的服务端分支（典型：摘要"部分脱敏 / 完整"）。
   * 计量型权益的余量一律以 crm_benefit_quotas 池为准，不得拿本方法代替——
   * 矩阵 value_num 是"应发额度"，池是"已剩额度"，两者不是一回事。
   */
  async levelForUser(userId: number | null, benefitCode: string): Promise<number> {
    const plan = userId ? await this.findActivePlanForUser(userId) : null;
    const cells = await this.loadCells([plan?.plan_code ?? FREE_PLAN_CODE]);
    const cell = cells.find((c) => c.benefit_code === benefitCode);
    return cell ? Number(cell.value_level ?? 0) : 0;
  }

  /**
   * 额度池余额（每个权益取当前周期最新一行）。
   * subscriptionId 传 null = 查普通用户池（subscription_id IS NULL），NULL 安全比较。
   */
  async listQuotaBalances(userId: number, subscriptionId: number | null): Promise<QuotaBalanceRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT benefit_code, scope, quota_total, quota_used, status, period, period_starts_at
         FROM crm_benefit_quotas
        WHERE seat_user_id = ? AND subscription_id <=> ? AND scope = 'subscription'
          AND period_starts_at <= NOW()
        ORDER BY benefit_code, period_starts_at DESC, id DESC`,
      [userId, subscriptionId],
    );
    const latest = new Map<string, QuotaBalanceRow>();
    for (const r of rows as Array<Record<string, unknown>>) {
      if (latest.has(String(r.benefit_code))) continue; // 已按周期倒序，首见即当前周期
      const total = Number(r.quota_total);
      latest.set(String(r.benefit_code), {
        benefit_code: String(r.benefit_code),
        scope: r.scope as QuotaBalanceRow["scope"],
        quota_total: total,
        quota_used: Number(r.quota_used),
        status: r.status as QuotaBalanceRow["status"],
        period: r.period as QuotaBalanceRow["period"],
        period_starts_at: r.period_starts_at as Date,
        remaining: r.status === "active" ? (total === -1 ? null : Math.max(0, total - Number(r.quota_used))) : 0,
      });
    }
    return [...latest.values()];
  }

  /**
   * 详情页等展示用的权益门控状态：对每个 active 权益给出——
   *   free（免费档即含）/ included（当前套餐已含）/ upgrade（升到某在售固定档可得）/
   *   contact（仅联系销售档可得）。'unlock'（需解锁本条公告）由消费方结合是否已解锁自行判定，
   *   此处只给“当前套餐能否解锁”（notice_view → included/upgrade）。全部由矩阵驱动，
   *   避免前端再维护一套与矩阵可能漂移的硬编码档位。
   */
  async resolveGates(userId: number | null): Promise<Record<string, GateState>> {
    const plan = userId ? await this.findActivePlanForUser(userId) : null;
    const planCode = plan?.plan_code ?? FREE_PLAN_CODE;
    const [defs, cells, activePlans] = await Promise.all([
      this.listBenefits(),
      this.loadCells(),
      this.listActivePlans(),
    ]);
    const byKey = new Map(cells.map((c) => [`${c.plan_code}|${c.benefit_code}`, c]));
    const enabledIn = (pc: string, code: string): boolean => {
      const def = defs.find((d) => d.benefit_code === code);
      const cell = byKey.get(`${pc}|${code}`);
      return !!def && !!cell && resolveCell(def, cell).enabled;
    };
    // 自助可购（fixed）档：命中则“可升级”；仅联系销售档能拿则“需联系”。
    const fixedPlans = activePlans.filter((p) => p.price_mode === "fixed").map((p) => p.plan_code);
    const gates: Record<string, GateState> = {};
    for (const def of defs) {
      const code = def.benefit_code;
      if (enabledIn(planCode, code)) {
        gates[code] = planCode === FREE_PLAN_CODE ? "free" : "included";
      } else if (fixedPlans.some((pc) => enabledIn(pc, code))) {
        gates[code] = "upgrade";
      } else {
        gates[code] = "contact";
      }
    }
    return gates;
  }
}
