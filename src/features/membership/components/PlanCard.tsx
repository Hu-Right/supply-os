/**
 * 套餐卡片组件（桌面横向并排 · 常显）
 * Plan Card Component — Horizontal Pricing Card
 *
 * @module features/membership/components/PlanCard
 * @description 多卡并排布局下的单张常显卡片：彩色卡头（推荐档 amber 强调）+ 价格块 +
 *              ✓/✗ 权益清单（复用 benefit-matrix SSOT）+ CTA。取代旧纵向手风琴。
 */
import { ArrowRight, ArrowUpCircle, Check, X, Sparkles } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { MembershipPlan } from "@/types";
import { COMPARISON_ROWS, comparisonRowEnabled } from "@/lib/services/benefit-matrix";
import { formatQuota, splitDescription, isRecommendedPlan } from "../utils";

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
  plan, currentPlanPrice, currentPlanCode, onBuy, onUpgrade,
}: PlanCardProps) {
  const { t } = useLocale();
  const rank = Number(plan.benefit_rank ?? 0);
  const recommended = isRecommendedPlan(plan);

  // 升级判断：存在可升级的周期性套餐，且卡片价格高于当前套餐（基于数据库价格，不硬编码）
  const hasUpgradeablePlan = Boolean(currentPlanCode) && Number(currentPlanPrice || 0) > 0;
  const priceDiff = Number(plan.price) - Number(currentPlanPrice || 0);
  const isUpgradeTarget = hasUpgradeablePlan && priceDiff > 0;

  const subtitle = splitDescription(plan.description)[0];
  // ✓/✗ 权益清单：仅布尔行（额度/有效期已在价格块以文本展示），与后端闸门/对比表同源
  const boolRows = COMPARISON_ROWS.filter((r) => !r.render);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-xs ${
        recommended ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
      }`}
      data-testid="plan-card"
    >
      {recommended && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-bold text-white">
          <Sparkles className="w-3 h-3" />
          {t("membershipRecommended")}
        </span>
      )}

      {/* ═══ 卡头 ═══ */}
      <div
        className={`px-5 py-4 text-white bg-gradient-to-br ${
          recommended ? "from-amber-500 to-amber-600" : "from-primary-500 to-primary-600"
        }`}
      >
        <h3 className="text-base font-extrabold leading-tight">{plan.name}</h3>
        {subtitle && <p className="mt-1 text-xs text-white/85 line-clamp-2">{subtitle}</p>}
      </div>

      {/* ═══ 价格块 ═══ */}
      <div className="px-5 pt-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {plan.currency === "CNY" ? "¥" : "$"}
            {plan.price.toLocaleString()}
          </span>
          {plan.duration_days && plan.duration_days >= 360 && (
            <span className="text-sm font-medium text-slate-500">/{t("membershipYear")}</span>
          )}
          <p className="mt-0.5 text-2xs text-slate-500">
            {plan.duration_days
              ? `${plan.duration_days}${t("membershipDays")}`
              : t("membershipValidityPermanent")}{" "}
            · {formatQuota(plan, t)}
          </p>
        </div>
      </div>

      {/* ═══ ✓/✗ 权益清单（复用矩阵）═══ */}
      <ul className="flex-1 space-y-1.5 px-5 py-4">
        {boolRows.map((row) => {
          const on = comparisonRowEnabled(rank, row);
          return (
            <li
              key={row.key}
              className={`flex items-center gap-2 text-xs ${on ? "text-slate-700" : "text-slate-400"}`}
            >
              {on ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              )}
              <span className={on ? "" : "line-through decoration-slate-300"}>
                {row.i18nKey ? t(row.i18nKey as never) : row.label}
              </span>
            </li>
          );
        })}
      </ul>

      {/* ═══ CTA ═══ */}
      <div className="px-5 pb-5">
        {isUpgradeTarget ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => onUpgrade?.(plan)}
            className="w-full rounded-xl py-2.5 text-sm"
          >
            <ArrowUpCircle className="w-4 h-4" />
            {t("upgradeBtn")} {plan.currency === "CNY" ? "¥" : "$"}
            {priceDiff.toLocaleString()}
          </Button>
        ) : hasUpgradeablePlan ? (
          <div className="w-full rounded-xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50 py-2.5 text-center">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
              <Check className="w-4 h-4" />
              {t("membershipAlreadyVip")}
            </span>
          </div>
        ) : (
          <Button
            type="button"
            variant="cta"
            onClick={() => onBuy(plan)}
            className="w-full rounded-xl py-2.5 text-sm"
          >
            {t("membershipBuyNow")}
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
