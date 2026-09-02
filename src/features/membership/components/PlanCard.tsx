/**
 * 套餐卡片组件
 * Plan Card Component
 *
 * @module features/membership/components/PlanCard
 */
import { ArrowRight, ArrowUpCircle, Check } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { MembershipPlan } from "@/types";
import { PLAN_CONFIG, ORIGINAL_PRICES, formatQuota, splitDescription, getPlanFeatures } from "../utils";

export interface PlanCardProps {
  plan: MembershipPlan;
  isVip: boolean;
  /** 用户当前最优周期性套餐价格（null 表示无可升级套餐） */
  currentPlanPrice?: number | null;
  /** 用户当前最优周期性套餐 code */
  currentPlanCode?: string | null;
  onBuy: (plan: MembershipPlan) => void;
  /** 升级回调（卡片套餐价格高于当前套餐时触发） */
  onUpgrade?: (plan: MembershipPlan) => void;
}

export function PlanCard({
  plan, isVip, currentPlanPrice, currentPlanCode, onBuy, onUpgrade,
}: PlanCardProps) {
  const { t } = useLocale();
  const config = PLAN_CONFIG[plan.plan_type] || PLAN_CONFIG.single;
  const Icon = config.icon;

  // 升级判断：存在可升级的周期性套餐，且卡片价格高于当前套餐（基于数据库价格，不硬编码）
  const hasUpgradeablePlan = Boolean(currentPlanCode) && Number(currentPlanPrice || 0) > 0;
  const priceDiff = Number(plan.price) - Number(currentPlanPrice || 0);
  const isUpgradeTarget = hasUpgradeablePlan && priceDiff > 0;

  return (
    <div
      key={plan.plan_code}
      className="group relative flex flex-col rounded-2xl bg-white/80 backdrop-blur-xl border-2 border-slate-200/80 shadow-lg transition-all duration-300 hover:shadow-2xl hover:shadow-teal-200/50 hover:border-teal-400 hover:-translate-y-2 hover:bg-white"
      data-testid="plan-card"
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {plan.currency === "CNY" ? "¥" : "$"}
              {plan.price.toLocaleString()}
            </span>
            {/* P1-11 安全修复：仅 duration_days >= 360 才显示"/年"，否则不显示周期后缀 */}
            {plan.duration_days && plan.duration_days >= 360 ? (
              <span className="text-sm text-slate-500 font-medium">/{t("membershipYear")}</span>
            ) : null}
            {ORIGINAL_PRICES[plan.plan_code] && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-3xs font-semibold border border-blue-100">
                {t("firstOrderDiscount")}
              </span>
            )}
          </div>
          {ORIGINAL_PRICES[plan.plan_code] && (
            <div className="mt-1">
              <span className="text-sm text-slate-400 line-through">
                {plan.currency === "CNY" ? "¥" : "$"}
                {ORIGINAL_PRICES[plan.plan_code].toLocaleString()}
                {plan.duration_days && plan.duration_days >= 360 ? `/${t("membershipYear")}` : ""}
              </span>
            </div>
          )}
          <div className="mt-1">
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
        </div>

        <div className="text-xs text-slate-600 leading-relaxed mb-4 flex-1">
          {splitDescription(plan.description).map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-100 min-h-[130px]">
          <ul className="space-y-2">
            {getPlanFeatures(plan.plan_code).map((feat, idx) => {
              const FeatIcon = feat.icon;
              return (
                <li key={idx} className="flex items-center gap-2 text-xs text-slate-700">
                  <div className={`w-5 h-5 rounded-full ${feat.bg} flex items-center justify-center flex-shrink-0`}>
                    <FeatIcon className={`w-3 h-3 ${feat.color}`} />
                  </div>
                  <span>{t(feat.label as any)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="px-6 pb-6 pt-0">
        {isUpgradeTarget ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => onUpgrade?.(plan)}
            className="w-full rounded-xl py-3 text-xs shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            {t("upgradeBtn")} {plan.currency === "CNY" ? "¥" : "$"}{priceDiff.toLocaleString()}
          </Button>
        ) : hasUpgradeablePlan ? (
          <div className="w-full rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 py-3 text-center">
            <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              {t("membershipAlreadyVip")}
            </span>
          </div>
        ) : (
          <Button
            type="button"
            variant="cta"
            onClick={() => onBuy(plan)}
            className="w-full rounded-xl py-3 text-xs shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
          >
            {t("membershipBuyNow")}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
