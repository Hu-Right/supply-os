/**
 * 会员套餐卡片展示工具（新权益体系）
 * Membership plan card utilities — reads the server-resolved comparison matrix.
 *
 * @module features/membership/utils
 * @description 档位卡的 ✓/✗ 权益清单与额度展示一律读取 `/api/membership/plans` 返回的
 *              服务端解析矩阵（ComparisonView，已按 commercial_tier 归组为三档列）：
 *              enabled/display 由后端按矩阵逐格算好，前端不再维护 benefit_rank /
 *              COMPARISON_ROWS 客户端副本（旧客户端 SSOT 退役）。
 */
import type { ComparisonView, PlanView, ResolvedCellView, TieredPlanView } from "@/types";

/** 卡片权益 chip：一行权益在本档的解析结果 + 中文行名。 */
export interface PlanFeatureChip {
  benefitCode: string;
  label: string;
  cell: ResolvedCellView;
}

/**
 * 推荐档判定：官网角标 `most_popular`（结构化字段驱动，前端零硬编码）。
 * 对应 plan_catalog.badge 枚举，与旧体系按 benefit_rank 硬编码 PRO 档同源退役。
 * 入参取最小结构（代表行/周期子行都可能携带 badge）。
 */
export function isRecommendedPlan(plan: { badge: string }): boolean {
  return plan.badge === "most_popular";
}

/**
 * 卡片 ✓/✗ 权益清单：取对比矩阵中 bool/enum 行（计量额度、金额行由价格块与额度池另行展示）。
 * 缺格（cell 不存在）不猜默认值——直接过滤，由矩阵完整性在服务端兜底。
 */
export function getPlanFeatureChips(table: ComparisonView, planCode: string): PlanFeatureChip[] {
  return table.rows
    .filter((r) => r.benefit.valueKind === "bool" || r.benefit.valueKind === "enum")
    .map((r) => ({ benefitCode: r.benefit.benefitCode, label: r.benefit.nameZh, cell: r.cells[planCode] }))
    .filter((chip) => chip.cell != null);
}

/** 取某档在指定计量权益（默认解锁额度 notice_view）上的展示原文（如「不限」/「10」）。 */
export function getPlanQuotaDisplay(
  table: ComparisonView,
  planCode: string,
  benefitCode = "notice_view",
): string | null {
  const row = table.rows.find((r) => r.benefit.benefitCode === benefitCode);
  return row?.cells[planCode]?.display ?? null;
}

/**
 * 企业 Tab 内与订阅卡并列展示的服务 SKU：已退役。
 * 2026-10-28 新服务目录（8 行）不再含旧的「199 人工找单」（svc_manual_bid_match），
 * 企业 Tab 收敛为 business + concierge 两张档位卡，无并列服务卡。
 */

/** 按派生受众把套餐分为个人版 / 企业版两组（缺失 audience 归企业版，与后端兜底一致）。 */
export function groupPlansByAudience<T extends PlanView>(plans: T[]): {
  personal: T[];
  enterprise: T[];
} {
  const personal: T[] = [];
  const enterprise: T[] = [];
  for (const p of plans) {
    if (p.audience === "personal") personal.push(p);
    else enterprise.push(p);
  }
  return { personal, enterprise };
}

/** 订制服务卡的两条成交分支：自助支付 / 预约顾问。 */
export type ServiceBranch = "pay" | "consult";

/**
 * 订制服务分支：只有「saleMode='self' + 有正标价 + 非起点价」才走自助支付；
 * lead/contract（留资、合同成交）与 token/quote/contact 无价行一律「预约顾问」。
 * 与 lib/payment/service-payment 的闸口同口径（判定字段全部来自目录行，前端不复制常量）。
 *
 * 其中 `priceFrom = 1` 是报价表里「N 元起 / 500元~3,000元按标的额」这类**起点价**的标记：
 * 真实价格取决于标的额、调研方向数等变量，按底价直接收款属于错卖（少收的部分无法补收），
 * 所以即便它是 self 且有标价，也必须转顾问询价。
 */
export function resolveServiceBranch(row: { standardPrice: string | null; saleMode: string; priceFrom: number }): ServiceBranch {
  if (Number(row.priceFrom) === 1) return "consult";
  const n = row.standardPrice == null ? NaN : Number(row.standardPrice);
  return row.saleMode === "self" && Number.isFinite(n) && n > 0 ? "pay" : "consult";
}

/** 服务名本地化：zh 取 nameZh，其余取 nameEn（设计 B6）。 */
export function serviceDisplayName(row: { nameZh: string; nameEn: string }, lang: string): string {
  return lang.toLowerCase().startsWith("zh") ? row.nameZh : row.nameEn;
}

/** 按 category 分组，固定展示顺序对齐 260928 报价表板块（顾问年包 → 专业增值 → API 授权）；丢弃空分组。 */
export function groupServicesByCategory<T extends { category: string }>(rows: T[]): Record<string, T[]> {
  const order = ["advisory", "pro_service", "api_license"];
  const grouped: Record<string, T[]> = {};
  for (const cat of order) grouped[cat] = [];
  for (const r of rows) (grouped[r.category] ??= []).push(r);
  for (const k of Object.keys(grouped)) if (grouped[k].length === 0) delete grouped[k];
  return grouped;
}

/**
 * 订制服务 Tab 允许展示的服务类别（2026-09-28 与文档对齐）：
 * 文档列的 12 行服务都必须能点到，故三类全放（旧白名单只留 advisory + api_license，
 * 使合规/调研/拆解报告等 pro_service 行成了「文档在售、官网买不到」的死数据）。
 */
export const SERVICE_TAB_CATEGORIES: readonly string[] = ["advisory", "pro_service", "api_license"];

/**
 * 服务 Tab 分组过滤：保留允许类别（服务目录本身已不含档位卡商品，无需再剔除）。
 */
export function pickServiceTabGroups<T extends { serviceCode: string }>(
  grouped: Record<string, T[]>,
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(grouped)
      .filter(([cat]) => SERVICE_TAB_CATEGORIES.includes(cat))
      .filter(([, rows]) => rows.length > 0),
  );
}

/* ── 档位归组（2026-10-28 三档体系）── */

/** commercial_tier → 官网档位名 i18n 键（个人会员/企业会员/人工对接）；未登记 tier 回退数据行名。 */
export const TIER_NAME_KEYS: Readonly<Record<string, string>> = {
  L1: "tierPersonal",
  L3: "tierBusiness",
  L4: "tierConcierge",
};

/** 档位卡标题：登记过的 tier 用档位名（同档三周期共名），未登记的回退代表行名（对旧数据形态健壮）。 */
export function tierDisplayName(plan: PlanView): { nameKey?: string; fallback: string } {
  const nameKey = TIER_NAME_KEYS[plan.commercialTier];
  return { nameKey, fallback: plan.nameZh };
}

/**
 * 周期子行 → 档位卡展示行：在档内 periods 里选目标周期，缺该周期时回退最长周期行
 * （对"某档缺季付"之类的目录形态健壮），periods 为空则退回代表行本身。
 */
export function pickPeriodRow(plan: PlanView, billingDays: number | null): PlanView {
  const periods = (plan as TieredPlanView).periods ?? [];
  if (periods.length === 0) return plan;
  if (billingDays != null) {
    const hit = periods.find((p) => p.billingPeriodDays === billingDays);
    if (hit) return hit as PlanView;
  }
  return periods[periods.length - 1] as PlanView;
}

/** 周期天数 → 档位卡价格后缀单位键（/月 ·/季 ·/年）；无周期（永久行）由调用方另走「永久有效」文案。 */
export function periodUnitKey(billingDays: number | null): string {
  if (billingDays == null) return "membershipValidityPermanent";
  if (billingDays <= 31) return "membershipMonth";
  if (billingDays <= 100) return "membershipQuarter";
  return "membershipYear";
}

/** 周期天数 → 切换控件文案键（月付/季付/年付）；无周期行沿用「永久有效」。 */
export function periodSwitchKey(billingDays: number | null): string {
  if (billingDays == null) return "membershipValidityPermanent";
  if (billingDays <= 31) return "periodMonthly";
  if (billingDays <= 100) return "periodQuarterly";
  return "periodYearly";
}
