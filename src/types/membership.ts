/** 权益体系的共享数据契约；字段直接对应目录、矩阵、订阅和账本。 */
export type BenefitKind = "bool" | "enum" | "quota" | "amount";

/**
 * 权益目录行。本接口只描述「代码要读的列」，不是库表全列的镜像：
 * 目录精简后 group_code / is_consumable / requires_subscription / gate_key / is_active
 * 均不再由本仓读取（计量型权益的判据唯一为 value_kind==='quota'）。
 */
export interface BenefitDefRow {
  benefit_code: string;
  name_zh: string;
  value_kind: BenefitKind;
  level_dict: Record<string, string> | null;
  /** 矩阵行全局唯一展示顺序（库内由 uk_benefit_sort 保证） */
  sort_order: number;
}

export interface PlanCatalogRow {
  plan_code: string;
  name_en: string;
  name_zh: string;
  positioning_zh: string;
  price: string;
  price_mode: "fixed" | "contact" | "free";
  price_incl_tax: number | null;
  currency: string;
  billing_period_days: number | null;
  commercial_tier: string;
  /** 派生受众分区（非 DB 列）：commercial_tier L1/L2=personal，其余=enterprise */
  audience: "personal" | "enterprise";
  cta_i18n_key: string;
  badge: string;
  sort_order: number;
  is_active: number;
  /**
   * 升级全额抵扣窗口天数（m104，来源 260928 报价表 129/999 行）：
   * 自订阅生效起 N 天内升级按补差价（=已付款全额抵扣，且一次付款只能抵扣一次）；
   * 超窗口不给抵扣路径，按目标档原价新购。NULL=本档不承诺抵扣（沿用补差价）。
   */
  upgrade_credit_days: number | null;
}

export interface MatrixCellRow {
  plan_code: string;
  benefit_code: string;
  value_level: number | null;
  value_num: number | null;
  value_amount: string | null;
  note_zh: string | null;
}

export interface ResolvedCell {
  plan_code: string;
  benefit_code: string;
  kind: BenefitKind;
  raw: number | string;
  enabled: boolean;
  display: string;
  note: string | null;
}

export interface ActivePlanRow {
  subscription_id: number;
  owner_user_id: number;
  plan_code: string;
  source_order_no: string;
  price_paid: string;
  currency: string;
  started_at: Date | string;
  expires_at: Date | string | null;
}

export interface QuotaBalanceRow {
  benefit_code: string;
  quota_total: number;
  quota_used: number;
  /** 池状态：扣满置 exhausted，退款/升级承接置 frozen；订阅过期由 crm_plan_subscriptions 表达 */
  status: "active" | "exhausted" | "frozen";
  /** 当前发放代次起点（幂等锚点：订阅池=该订阅 started_at，普通用户池=1970-01-01 终身哨兵） */
  period_starts_at: Date | string;
  /** 不限为 null，其余取该池可消费余额。 */
  remaining: number | null;
}

export interface ComparisonTable {
  plans: PlanCatalogRow[];
  rows: Array<{ benefit: BenefitDefRow; cells: Record<string, ResolvedCell> }>;
}

/**
 * 权益门控状态（由服务端按矩阵算出，供详情页 Tab 角标等展示消费）：
 *   free 免费可看 / included 当前套餐已含 / unlock 需解锁本条公告 /
 *   upgrade 需升级至在售档 / contact 需联系销售。
 */
export type GateState = "free" | "included" | "unlock" | "upgrade" | "contact";

export interface MembershipStatus {
  plan: PlanCatalogRow;
  subscription: ActivePlanRow | null;
  quotas: QuotaBalanceRow[];
  /** 各权益对当前用户的门控状态（benefit_code -> GateState）；服务端下发，前端不复制档位常量。 */
  gates?: Record<string, GateState>;
  /**
   * 升级全额抵扣窗口（仅当前档声明了 upgrade_credit_days 时下发）：
   * 服务端与 previewUpgrade 同一口径算好，前端只读不算，不往客户端拄 7 天/档位常量。
   */
  upgrade_credit?: { days: number; open: boolean; deadline_at: string | null };
}

/**
 * 可用的年包抵扣单（文档「199 升级年包可全额抵扣」）：服务端从 crm_service_orders
 * 找出一张已成交且未被任何 pending/paid 订单引用的可抵扣单，金额取成交快照单价。
 */
export interface AnnualPlanCredit {
  source_order_no: string;
  amount: number;
  currency: string;
}

export interface UpgradePreview {
  can_upgrade: boolean;
  reason: string | null;
  current_plan: PlanCatalogRow | null;
  target_plan: PlanCatalogRow | null;
  subscription: ActivePlanRow | null;
  quota_used: number;
  /** 应付金额：抵扣成立时 = 目标价 − 当前档标价；抵扣资格不成立时 = 目标档原价（即 new_purchase_price）。 */
  price_difference: number;
  remaining_after_upgrade: number | null;
  expires_at_unchanged: boolean;
  /** 当前档声明的抵扣窗口天数（NULL=无窗口约束，沿用补差价）。 */
  credit_days: number | null;
  /** 抵扣窗口的截止时间（ISO）；无窗口约束时为 null。 */
  credit_deadline_at: string | null;
  /** 抵扣资格不成立时改走的「原价新购」金额（= 目标档标价）；可抵扣时为 null。 */
  new_purchase_price: number | null;
}

/** 增值服务目录行（crm_service_catalog，is_active=1）— 前端订制服务 Tab 渲染契约 */
export interface ServiceCatalogRow {
  service_code: string;
  category: string;
  name_zh: string;
  name_en: string;
  price_mode: string;
  standard_price: string | null;
  price_from: number;
  currency: string;
  sale_mode: string;
  member_discount: "none" | "any_plan" | "unlimited_plus";
  /** 1=成交单可在购买年付套餐时全额抵扣本单金额（文档「升级年包可全额抵扣」，m104）。 */
  credit_to_annual_plan: number;
  deliverable_note_zh: string | null;
  sort_order: number;
}
