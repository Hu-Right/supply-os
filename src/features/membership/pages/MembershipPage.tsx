/**
 * 会员套餐详情页面
 * Membership Plans Detail Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 从数据库动态获取套餐信息，支持 1-5+ 个套餐的自适应展示。
 *              Kujiale-style layout + Apple Glassmorphism design for membership plans. 
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Crown, Check, Zap, Star,
  ArrowRight, Globe, Users, Briefcase, AlertCircle, Building2,
} from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { fetchPlans, fetchMembershipStatus } from "../api";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import type { MembershipPlan, MembershipStatus } from "@/types";

/** 套餐特性配置 — 覆盖所有 plan_type */
const PLAN_CONFIG: Record<string, { icon: typeof Zap; gradient: string }> = {
  single: { icon: Zap, gradient: "from-blue-500 to-cyan-500" },
  bundle: { icon: Star, gradient: "from-violet-500 to-purple-500" },
  subscription: { icon: Crown, gradient: "from-amber-500 to-orange-500" },
  manual: { icon: Briefcase, gradient: "from-emerald-500 to-teal-500" },
};

/** 套餐原价映射（用于展示首单优惠等促销信息） */
const ORIGINAL_PRICES: Record<string, number> = {
  annual_799: 1999,
};

/** 根据套餐数量计算响应式网格列数 */
function getGridCols(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-md mx-auto";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto";
  if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
}

/** 格式化配额显示 */
function formatQuota(plan: MembershipPlan, t: (key: string) => string): string {
  if (plan.unlock_quota >= 9999) return t("membershipUnlimited");
  return `${plan.unlock_quota}${t("membershipUnlocks")}`;
}

/**
 * 将描述文本按 ②③④⑤ 编号分割为多行
 * 例："全年最高 365 条。①专属客服。②供应商库。" → ["全年最高 365 条。", "专属客服。", "供应商库。"]
 */
function splitDescription(desc: string): string[] {
  if (!desc) return [];
  const parts = desc.split(/\n|①|②|③|④|⑤|⑥|⑦|⑧|⑨/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [desc];
}

/**
 * 各套餐等级的差异化特色特性
 * 根据 plan_code 前缀匹配，展示该套餐独有的核心卖点
 */
function getPlanFeatures(planCode: string): { icon: typeof Check; color: string; bg: string; label: string }[] {
  const tier = (() => {
    // 精确匹配（与 PlanComparisonTable.getPlanTier 保持一致）
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

export default function MembershipPage() {
  const [searchParams] = useSearchParams();
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([
      fetchPlans(),
      authUser ? fetchMembershipStatus(authUser.user_key).catch(() => null) : Promise.resolve(null),
    ])
      .then(([fetchedPlans, status]) => {
        if (!alive) return;
        const paidPlans = Array.isArray(fetchedPlans)
          ? fetchedPlans.filter((p) => p.plan_type !== "free")
          : [];
        setPlans(paidPlans);
        setMembership(status);
        setError(null);
      })
      .catch((err) => {
        if (alive) {
          setError("套餐数据加载失败，请稍后重试");
          setPlans([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authUser]);

  const handleBuyPlan = (plan: MembershipPlan) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }

    emitAppEvent("supply-os:pay", {
      code: plan.plan_code,
      name: plan.name,
      price: Number(plan.price),
      currency: plan.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: noticeId
        ? `${window.location.origin}/procurement?notice_id=${noticeId}`
        : `${window.location.origin}/membership`,
    });
  };

  const freeRemaining = membership?.free_remaining ?? 3;
  const freeQuota = membership?.free_quota ?? 3;

  const gridCols = getGridCols(plans.length);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* 套餐卡片区域 */}
      <section className="bg-gradient-to-b from-slate-50/80 to-white py-16 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              {t("membershipPlansTitle")}
            </h2>
            <p className="text-base text-slate-600 max-w-xl mx-auto">
              {t("membershipPlansDesc")}
            </p>
          </div>

          {loading ? (
          <div className={`grid ${gridCols} gap-5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm p-6 shadow-lg animate-pulse">
                <div className="h-10 w-10 bg-slate-200/60 rounded-xl mb-5" />
                <div className="h-5 bg-slate-200/60 rounded w-3/4 mb-3" />
                <div className="h-10 bg-slate-200/60 rounded w-1/2 mb-5" />
                <div className="h-3.5 bg-slate-200/60 rounded w-full mb-2" />
                <div className="h-3.5 bg-slate-200/60 rounded w-5/6 mb-6" />
                <div className="h-11 bg-slate-200/60 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-slate-600 text-lg mb-2">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium cursor-pointer"
            >
              重新加载
            </button>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">暂无可用套餐</p>
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-5`}>
            {plans.map((plan) => {
              const config = PLAN_CONFIG[plan.plan_type] || PLAN_CONFIG.single;
              const Icon = config.icon;

              return (
                <div
                  key={plan.plan_code}
                  className="group relative flex flex-col rounded-2xl bg-white/80 backdrop-blur-xl border-2 border-slate-200/80 shadow-lg transition-all duration-300 hover:shadow-2xl hover:shadow-teal-200/50 hover:border-teal-400 hover:-translate-y-2 hover:bg-white"
                >

                  <div className="flex-1 flex flex-col p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-md flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 leading-tight">{plan.name}</h3>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                          {plan.currency === "CNY" ? "¥" : "$"}
                          {plan.price.toLocaleString()}
                        </span>
                        {ORIGINAL_PRICES[plan.plan_code] && (
                          <>
                            <span className="text-sm text-slate-400 line-through">
                              {plan.currency === "CNY" ? "¥" : "$"}
                              {ORIGINAL_PRICES[plan.plan_code].toLocaleString()}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                              {t("firstOrderDiscount")}
                            </span>
                          </>
                        )}
                      </div>
                      {plan.duration_days ? (
                        <span className="text-xs text-slate-500 font-medium">
                          {plan.duration_days}{t("membershipDays")} · {formatQuota(plan, t)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium">
                          {t("membershipValidityPermanent")} · {formatQuota(plan, t)}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 leading-relaxed mb-5 flex-1 space-y-1.5">
                      {splitDescription(plan.description).map((line, idx) => (
                        <p key={idx}>{line}</p>
                      ))}
                    </div>

                    <ul className="space-y-2 mb-6">
                      {getPlanFeatures(plan.plan_code).map((feat, idx) => {
                        const FeatIcon = feat.icon;
                        return (
                          <li key={idx} className="flex items-center gap-2 text-xs text-slate-700">
                            <div className={`w-4 h-4 rounded-full ${feat.bg} flex items-center justify-center flex-shrink-0`}>
                              <FeatIcon className={`w-2.5 h-2.5 ${feat.color}`} />
                            </div>
                            {t(feat.label as any)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="px-6 pb-6 pt-0">
                    {isVip ? (
                      <div className="w-full rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 py-3 text-center">
                        <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          {t("membershipAlreadyVip")}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuyPlan(plan)}
                        className="w-full rounded-xl py-3 text-xs font-bold bg-slate-900 text-white hover:bg-teal-600 shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {t("membershipBuyNow")}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </section>

      {/* 权益对比表区域 */}
      {!loading && plans.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              {t("membershipComparisonTitle")}
            </h2>
            <p className="text-base text-slate-600 max-w-xl mx-auto">
              {t("membershipPlansDesc")}
            </p>
          </div>
          <PlanComparisonTable plans={plans} />
        </section>
      )}
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
