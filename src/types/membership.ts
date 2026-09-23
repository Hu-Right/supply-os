/** 权益体系的共享数据契约；字段直接对应目录、矩阵、订阅和账本。 */
export type BenefitKind = "bool" | "enum" | "quota" | "amount";

export interface BenefitDefRow {
  benefit_code: string;
  name_zh: string;
  group_code: string;
  value_kind: BenefitKind;
  level_dict: Record<string, string> | null;
  is_consumable: number;
  requires_subscription: number;
  gate_key: string | null;
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
  seat_limit: number;
  commercial_tier: string;
  cta_i18n_key: string;
  badge: string;
  sort_order: number;
  is_active: number;
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
  seat_limit: number;
  started_at: Date | string;
  expires_at: Date | string | null;
  seat_role: "owner" | "member";
}

export interface QuotaBalanceRow {
  benefit_code: string;
  scope: "subscription" | "seat";
  quota_total: number;
  quota_used: number;
  status: "active" | "exhausted" | "frozen" | "expired";
  period: "none" | "monthly" | "yearly";
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
}

export interface UpgradePreview {
  can_upgrade: boolean;
  reason: string | null;
  current_plan: PlanCatalogRow | null;
  target_plan: PlanCatalogRow | null;
  subscription: ActivePlanRow | null;
  quota_used: number;
  price_difference: number;
  remaining_after_upgrade: number | null;
  expires_at_unchanged: boolean;
}
