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

/** 套餐特性配置 — 覆盖所有 plan_type */
export const PLAN_CONFIG: Record<string, { icon: typeof Zap; gradient: string }> = {
  single: { icon: Zap, gradient: "from-blue-500 to-cyan-500" },
  bundle: { icon: Star, gradient: "from-violet-500 to-purple-500" },
  subscription: { icon: Crown, gradient: "from-amber-500 to-orange-500" },
  manual: { icon: Briefcase, gradient: "from-emerald-500 to-teal-500" },
};

/** 套餐原价映射（用于展示首单优惠等促销信息） */
export const ORIGINAL_PRICES: Record<string, number> = {
  annual_799: 1999,
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
export function formatQuota(plan: MembershipPlan, t: (key: string) => string): string {
  if (plan.unlock_quota >= 9999) return t("membershipUnlimited");
  return `${plan.unlock_quota}${t("membershipUnlocks")}`;
}

/**
 * 将描述文本按 ②③④⑤ 编号分割为多行
 */
export function splitDescription(desc: string): string[] {
  if (!desc) return [];
  const parts = desc.split(/\n|①|②|③|④|⑤|⑥|⑦|⑧|⑨/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [desc];
}

/**
 * 各套餐等级的差异化特色特性
 */
export function getPlanFeatures(planCode: string): { icon: typeof Check; color: string; bg: string; label: string }[] {
  const tier = (() => {
    if (planCode === "annual_16800") return "enterprise_flagship";
    if (planCode === "annual_26800") return "enterprise_premium";
    if (planCode === "annual_8800" || planCode === "annual_manual_8800" || planCode === "annual_8") return "annual_basic";
    if (planCode === "annual_5600") return "enterprise_basic";
    if (planCode === "annual_799") return "personal";
    if (planCode.startsWith("single")) return "single";
    if (planCode.startsWith("personal") || planCode.startsWith("trial")) return "personal";
    if (planCode.startsWith("enterprise_premium")) return "enterprise_premium";
    if (planCode.startsWith("enterprise_flagship")) return "enterprise_flagship";
    if (planCode.startsWith("enterprise")) return "enterprise_basic";
    if (planCode.startsWith("annual")) return "annual";
    if (planCode.startsWith("week")) return "personal";
    return "single";
  })();

  const features: Record<string, { icon: typeof Check; color: string; bg: string; label: string }[]> = {
    single: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
    ],
    personal: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonTradeGroup" },
    ],
    enterprise_basic: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonTradeGroup" },
      { icon: Briefcase, color: "text-amber-600", bg: "bg-amber-100/80", label: "comparisonSupplierLibrary" },
    ],
    enterprise_flagship: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonPrivateGroup" },
      { icon: Globe, color: "text-purple-600", bg: "bg-purple-100/80", label: "comparisonUngmReg" },
    ],
    enterprise_premium: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonPrivateGroup" },
      { icon: Crown, color: "text-rose-600", bg: "bg-rose-100/80", label: "comparisonBidSupport" },
    ],
    annual_basic: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonTradeGroup" },
      { icon: Building2, color: "text-amber-600", bg: "bg-amber-100/80", label: "comparisonSupplierLibrary" },
      { icon: Briefcase, color: "text-amber-600", bg: "bg-amber-100/80", label: "comparisonDedicatedSupport" },
    ],
    annual: [
      { icon: Check, color: "text-teal-600", bg: "bg-teal-100/80", label: "comparisonOriginalLink" },
      { icon: Users, color: "text-blue-600", bg: "bg-blue-100/80", label: "comparisonPrivateGroup" },
      { icon: Briefcase, color: "text-amber-600", bg: "bg-amber-100/80", label: "comparisonContractSign" },
    ],
  };

  return features[tier] || features.single;
}
