/**
 * 会员套餐工具函数
 * Membership Plan Utilities
 *
 * @module features/membership/utils
 */
import {
  Crown, Zap, Star, Briefcase, Check, Users, Globe, Building2,
} from "lucide-react";
import type { MembershipPlan } from "@/types";
// A2 strict 修复：翻译函数类型统一从 useLocale 派生（带键联合类型），
// 原 (key: string) => string 在 strictFunctionTypes 下与真实 t 函数不兼容。
import type { useLocale } from "@/core/i18n";

/** i18n 翻译函数类型（与 useLocale 返回值中的 t 保持一致） */
type TranslateFn = ReturnType<typeof useLocale>["t"];

/** 套餐特性配置 — 覆盖所有 plan_type */
export const PLAN_CONFIG: Record<string, { icon: typeof Zap; gradient: string }> = {
  single: { icon: Zap, gradient: "from-blue-500 to-cyan-500" },
  bundle: { icon: Star, gradient: "from-violet-500 to-purple-500" },
  subscription: { icon: Crown, gradient: "from-amber-500 to-orange-500" },
  manual: { icon: Briefcase, gradient: "from-emerald-500 to-teal-500" },
};

/**
 * 套餐等级映射（对齐当前数据库 4 档付费套餐）。
 * 供卡片特色列表与权益对比表共用，避免两处各自维护前缀兜底而串档。
 *   personal_trial_129 → trial      个人体验版（10 条）
 *   personal_std_999   → standard   个人标准版（100 条）
 *   personal_pro_1299  → pro        个人专业版（不限量 + AI）
 *   enterprise_8800    → enterprise 企业年度会员（不限量 + 企业画像）
 */
export type PlanTier = "trial" | "standard" | "pro" | "enterprise";

export function getPlanTier(planCode: string): PlanTier {
  if (planCode.startsWith("enterprise")) return "enterprise";
  if (planCode.startsWith("personal_pro")) return "pro";
  if (planCode.startsWith("personal_std")) return "standard";
  if (planCode.startsWith("personal_trial")) return "trial";
  // 兜底：未识别的个人/试用类归最低档
  return "trial";
}

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
  return `${plan.unlock_quota}${t("membershipUnlocks")}`;
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

/**
 * 各套餐卡特色标签（对齐当前数据库 4 档套餐的真实卖点）。
 * label 为 i18n 键，渲染处经 t() 翻译；按 getPlanTier 分档，四档互不串档。
 */
export function getPlanFeatures(planCode: string): { icon: typeof Check; color: string; bg: string; label: string }[] {
  const feat = (
    label: string,
    icon: typeof Check = Check,
    color = "text-teal-600",
    bg = "bg-teal-100/80",
  ) => ({ icon, color, bg, label });

  const features: Record<PlanTier, { icon: typeof Check; color: string; bg: string; label: string }[]> = {
    trial: [
      feat("comparisonRawNotice"),
      feat("comparisonQualification", Globe, "text-purple-600", "bg-purple-100/80"),
    ],
    standard: [
      feat("comparisonRawNotice"),
      feat("comparisonBidHistory", Users, "text-blue-600", "bg-blue-100/80"),
    ],
    pro: [
      feat("comparisonAiScoring", Zap, "text-amber-600", "bg-amber-100/80"),
      feat("comparisonReport"),
      feat("comparisonIndustryPush", Globe, "text-purple-600", "bg-purple-100/80"),
    ],
    enterprise: [
      feat("comparisonEnterpriseProfile", Building2, "text-rose-600", "bg-rose-100/80"),
      feat("comparisonConsortiumBid", Users, "text-blue-600", "bg-blue-100/80"),
      feat("comparisonContractSign", Briefcase, "text-amber-600", "bg-amber-100/80"),
    ],
  };

  return features[getPlanTier(planCode)];
}
