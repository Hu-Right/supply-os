/**
 * 会员套餐工具函数
 * Membership Plan Utilities
 *
 * @module features/membership/utils
 */
import {
  Crown, Zap, Star, Briefcase, Check, Building2,
  Sparkles, Radar, FileCheck2, Download, TrendingUp, FileText, Bot, Bell, Handshake,
} from "lucide-react";
import type { MembershipPlan } from "@/types";
// A2 strict 修复：翻译函数类型统一从 useLocale 派生（带键联合类型），
// 原 (key: string) => string 在 strictFunctionTypes 下与真实 t 函数不兼容。
import type { useLocale } from "@/core/i18n";
import { COMPARISON_ROWS, comparisonRowEnabled } from "@/lib/services/benefit-matrix";

/** i18n 翻译函数类型（与 useLocale 返回值中的 t 保持一致） */
type TranslateFn = ReturnType<typeof useLocale>["t"];

/** 套餐特性配置 — 覆盖所有 plan_type */
export const PLAN_CONFIG: Record<string, { icon: typeof Zap; gradient: string }> = {
  single: { icon: Zap, gradient: "from-blue-500 to-cyan-500" },
  bundle: { icon: Star, gradient: "from-violet-500 to-purple-500" },
  subscription: { icon: Crown, gradient: "from-amber-500 to-orange-500" },
  manual: { icon: Briefcase, gradient: "from-emerald-500 to-teal-500" },
};

/** 根据套餐数量计算响应式网格列数 */
export function getGridCols(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-md mx-auto";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto";
  if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
}

/** 格式化配额显示 */
export function formatQuota(plan: MembershipPlan, t: TranslateFn): string {
  if (plan.unlock_quota >= 9999) return t("membershipUnlimited");
  return `${plan.unlock_quota} ${t("membershipUnlocks")}`;
}

/**
 * 将描述文本按 ②③④⑤ 编号分割为多行
 * A2 strict 修复：MembershipPlan.description 可能为 undefined，形参如实放宽；
 * 下方 !desc 守卫已覆盖空值路径，行为不变。
 */
export function splitDescription(desc: string | undefined): string[] {
  if (!desc) return [];
  const parts = desc.split(/\n|①|②|③|④|⑤|⑥|⑦|⑧|⑨/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [desc];
}

/** 对比矩阵行 key → 卡片 chip 图标/配色（V2 权益体系） */
const FEATURE_ICON: Record<string, { icon: typeof Check; color: string; bg: string }> = {
  summary: { icon: Sparkles, color: "text-teal-600", bg: "bg-teal-100/80" },
  similar: { icon: Radar, color: "text-cyan-600", bg: "bg-cyan-100/80" },
  qualification: { icon: FileCheck2, color: "text-blue-600", bg: "bg-blue-100/80" },
  files: { icon: Download, color: "text-indigo-600", bg: "bg-indigo-100/80" },
  award_history: { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-100/80" },
  report: { icon: FileText, color: "text-violet-600", bg: "bg-violet-100/80" },
  ai_score: { icon: Bot, color: "text-fuchsia-600", bg: "bg-fuchsia-100/80" },
  industry_push: { icon: Bell, color: "text-amber-600", bg: "bg-amber-100/80" },
  enterprise_profile: { icon: Building2, color: "text-rose-600", bg: "bg-rose-100/80" },
  consortium: { icon: Handshake, color: "text-orange-600", bg: "bg-orange-100/80" },
};

/**
 * 根据套餐生成差异化权益 chip 列表。
 * V2：不再按 plan_code 硬编码映射，而是从对比矩阵 SSOT（COMPARISON_ROWS）
 * 取该档位（benefit_rank）已启用的布尔权益——与详情页闸门/对比表同源。
 * label 优先用已有 i18n 键，否则以中文字面兑底（待六语本地化）。
 */
export function getPlanFeatures(
  plan: MembershipPlan,
): { icon: typeof Check; color: string; bg: string; label: string }[] {
  const rank = Number(plan.benefit_rank ?? 0);
  return COMPARISON_ROWS.filter((r) => !r.render && comparisonRowEnabled(rank, r)).map((r) => ({
    ...(FEATURE_ICON[r.key] ?? { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80" }),
    label: r.i18nKey ?? r.label,
  }));
}
