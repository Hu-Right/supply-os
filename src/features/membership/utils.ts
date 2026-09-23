/**
 * 会员套餐卡片展示工具（新权益体系）
 * Membership plan card utilities — reads the server-resolved comparison matrix.
 *
 * @module features/membership/utils
 * @description 六卡的 ✓/✗ 权益清单与额度展示一律读取 `/api/membership/plans` 返回的
 *              服务端解析矩阵（ComparisonTable）：enabled/display 由后端按矩阵逐格算好，
 *              前端不再维护 benefit_rank / COMPARISON_ROWS 客户端副本（旧客户端 SSOT 退役）。
 */
import type { ComparisonTable, PlanCatalogRow, ResolvedCell } from "@/types";

/** 卡片权益 chip：一行权益在本档的解析结果 + 中文行名。 */
export interface PlanFeatureChip {
  benefit_code: string;
  label: string;
  cell: ResolvedCell;
}

/**
 * 推荐档判定：官网角标 `most_popular`（结构化字段驱动，前端零硬编码）。
 * 对应 crm_plan_catalog.badge 枚举，与旧体系按 benefit_rank 硬编码 PRO 档同源退役。
 */
export function isRecommendedPlan(plan: PlanCatalogRow): boolean {
  return plan.badge === "most_popular";
}

/**
 * 卡片 ✓/✗ 权益清单：取对比矩阵中 bool/enum 行（计量额度、金额行由价格块与额度池另行展示）。
 * 缺格（cell 不存在）不猜默认值——直接过滤，由矩阵完整性在服务端兜底。
 */
export function getPlanFeatureChips(table: ComparisonTable, planCode: string): PlanFeatureChip[] {
  return table.rows
    .filter((r) => r.benefit.value_kind === "bool" || r.benefit.value_kind === "enum")
    .map((r) => ({ benefit_code: r.benefit.benefit_code, label: r.benefit.name_zh, cell: r.cells[planCode] }))
    .filter((chip) => chip.cell != null);
}

/** 取某档在指定计量权益（默认解锁额度 notice_view）上的展示原文（如「不限」/「10」）。 */
export function getPlanQuotaDisplay(
  table: ComparisonTable,
  planCode: string,
  benefitCode = "notice_view",
): string | null {
  const row = table.rows.find((r) => r.benefit.benefit_code === benefitCode);
  return row?.cells[planCode]?.display ?? null;
}

/** 按派生受众把套餐分为个人版 / 企业版两组（缺失 audience 归企业版，与后端兜底一致）。 */
export function groupPlansByAudience(plans: PlanCatalogRow[]): {
  personal: PlanCatalogRow[];
  enterprise: PlanCatalogRow[];
} {
  const personal: PlanCatalogRow[] = [];
  const enterprise: PlanCatalogRow[] = [];
  for (const p of plans) {
    if (p.audience === "personal") personal.push(p);
    else enterprise.push(p);
  }
  return { personal, enterprise };
}

/** 订制服务分支：standard_price 非空且 >0 → 收费下单；否则 → 客服码。 */
export type ServiceBranch = "pay" | "consult";
export function resolveServiceBranch(row: { standard_price: string | null }): ServiceBranch {
  const n = row.standard_price == null ? NaN : Number(row.standard_price);
  return Number.isFinite(n) && n > 0 ? "pay" : "consult";
}

/** 服务名本地化：zh 取 name_zh，其余取 name_en（设计 B6）。 */
export function serviceDisplayName(row: { name_zh: string; name_en: string }, lang: string): string {
  return lang.toLowerCase().startsWith("zh") ? row.name_zh : row.name_en;
}

/** 按 category 分组，固定展示顺序：专业增值 → 顾问 → API 授权；丢弃空分组。 */
export function groupServicesByCategory<T extends { category: string }>(rows: T[]): Record<string, T[]> {
  const order = ["pro_service", "advisory", "api_license"];
  const grouped: Record<string, T[]> = {};
  for (const cat of order) grouped[cat] = [];
  for (const r of rows) (grouped[r.category] ??= []).push(r);
  for (const k of Object.keys(grouped)) if (grouped[k].length === 0) delete grouped[k];
  return grouped;
}
