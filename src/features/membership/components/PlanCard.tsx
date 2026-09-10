/**
 * 套餐卡片组件（横向可展开）
 * Plan Card Component — Horizontal Expandable
 *
 * @module features/membership/components/PlanCard
 * @description 纵向堆叠布局下的横向卡片。默认收起仅展示核心信息，
 *              点击后展开显示完整权益详情与购买/升级按钮。
 */
import { ArrowRight, ArrowUpCircle, Check, ChevronDown } from "lucide-react";
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
  /** 当前卡片是否处于展开状态 */
  expanded: boolean;
  /** 展开/收起切换回调 */
  onToggle: () => void;
  onBuy: (plan: MembershipPlan) => void;
  /** 升级回调（卡片套餐价格高于当前套餐时触发） */
  onUpgrade?: (plan: MembershipPlan) => void;
}

export function PlanCard({
  plan, isVip, currentPlanPrice, currentPlanCode,
  expanded, onToggle, onBuy, onUpgrade,
}: PlanCardProps) {
  const { t } = useLocale();
  const config = PLAN_CONFIG[plan.plan_type] || PLAN_CONFIG.single;
  const Icon = config.icon;

  // 升级判断：存在可升级的周期性套餐，且卡片价格高于当前套餐（基于数据库价格，不硬编码）
  const hasUpgradeablePlan = Boolean(currentPlanCode) && Number(currentPlanPrice || 0) > 0;
  const priceDiff = Number(plan.price) - Number(currentPlanPrice || 0);
  const isUpgradeTarget = hasUpgradeablePlan && priceDiff > 0;

  const descLines = splitDescription(plan.description);
  const features = getPlanFeatures(plan.plan_code);

  return (
    <div
      className={`group rounded-2xl bg-white/80 backdrop-blur-xl border-2 shadow-lg transition-all duration-300 cursor-pointer ${
        expanded
          ? "border-teal-400 shadow-teal-100/50 bg-white"
          : "border-slate-200/80 hover:shadow-xl hover:shadow-teal-100/40 hover:border-teal-300"
      }`}
      data-testid="plan-card"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      aria-expanded={expanded}
    >
      {/* ═══ 头部行（始终可见） ═══ */}
      <div className="flex items-center gap-4 px-6 py-5">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-md shrink-0`}>
          <Icon className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900 leading-tight truncate">{plan.name}</h3>
          <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {plan.currency === "CNY" ? "¥" : "$"}
              {plan.price.toLocaleString()}
            </span>
            {plan.duration_days && plan.duration_days >= 360 ? (
              <span className="text-sm text-slate-500 font-medium">/{t("membershipYear")}</span>
            ) : null}
            {ORIGINAL_PRICES[plan.plan_code] && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-3xs font-semibold border border-blue-100">
                {t("firstOrderDiscount")}
              </span>
            )}
          </div>
          <div className="mt-0.5">
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

        {/* 展开指示器 */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${
          expanded ? "bg-teal-100 text-teal-600" : "bg-slate-100 text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-500"
        }`}>
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* ═══ 展开区域 ═══ */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-6">
          {/* 分割线 */}
          <div className="border-t border-slate-100 mb-4" />

          {/* 套餐描述 */}
          {descLines.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-600 leading-relaxed space-y-1.5">
                {descLines.map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* 权益特性列表 */}
          {features.length > 0 && (
            <div className="mb-5">
              <ul className="flex flex-wrap gap-2">
                {features.map((feat, idx) => {
                  const FeatIcon = feat.icon;
                  return (
                    <li
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700"
                    >
                      <div className={`w-4 h-4 rounded-full ${feat.bg} flex items-center justify-center shrink-0`}>
                        <FeatIcon className={`w-2.5 h-2.5 ${feat.color}`} />
                      </div>
                      <span>{t(feat.label as any)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 操作按钮 */}
          <div onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  );
}
