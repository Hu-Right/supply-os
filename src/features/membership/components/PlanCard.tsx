/**
 * 套餐卡片组件（桌面横向并排 · 常显）
 * Plan Card Component — Horizontal Pricing Card
 *
 * @module features/membership/components/PlanCard
 * @description 新权益体系：卡片直接消费服务端解析好的 ComparisonTable——
 *              卡头/价格读 crm_plan_catalog 商品属性，✓/✗ 权益清单读矩阵逐格，
 *              推荐角标读 badge（前端零硬编码，不再按 benefit_rank 拼档位）。
 */
import { ArrowRight, ArrowUpCircle, Check, X, Sparkles } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { ComparisonTable, PlanCatalogRow } from "@/types";
import { getPlanFeatureChips, getPlanQuotaDisplay, isRecommendedPlan } from "../utils";

export interface PlanCardProps {
  plan: PlanCatalogRow;
  /** 服务端解析的完整对比矩阵（本卡按 plan_code 取自身列） */
  table: ComparisonTable;
  /** 用户当前有效订阅套餐价格（null = 无可升级订阅） */
  currentPlanPrice?: number | null;
  /** 用户当前有效订阅套餐 code */
  currentPlanCode?: string | null;
  onBuy: (plan: PlanCatalogRow) => void;
  /** 升级回调（卡片套餐价格高于当前订阅时触发） */
  onUpgrade?: (plan: PlanCatalogRow) => void;
  /**
   * 当前订阅的升级全额抵扣窗口是否仍开着（服务端按目录 upgrade_credit_days 算好下发）：
   * false = 已过窗口，不给「升级补差价」入口，改走按原价新购；null/undefined = 本档无窗口约束（沿用升级补差价）。
   */
  upgradeCreditOpen?: boolean | null;
  /** 抵扣窗口天数（仅用于窗口已过时的文案说明；取自服务端下发，前端不写 7 天常量） */
  upgradeCreditDays?: number | null;
}

export function PlanCard({
  plan, table, currentPlanPrice, currentPlanCode, onBuy, onUpgrade, upgradeCreditOpen, upgradeCreditDays,
}: PlanCardProps) {
  const { t } = useLocale();
  const recommended = isRecommendedPlan(plan);
  const isContact = plan.price_mode === "contact";
  const symbol = plan.currency === "CNY" ? "¥" : "$";
  const audienceLabel = plan.audience === "enterprise" ? t("planAudienceEnterprise") : t("planAudiencePersonal");

  // 升级判断：存在可升级的固定价订阅，且本卡明码价高于当前订阅价（数据驱动，不硬编码）
  const hasUpgradeablePlan = Boolean(currentPlanCode) && Number(currentPlanPrice || 0) > 0;
  const priceDiff = Number(plan.price) - Number(currentPlanPrice || 0);
  const higherThanCurrent = hasUpgradeablePlan && priceDiff > 0;
  // 抵扣窗口已关：不能再走「升级补差价」（那条路径会冻结旧订阅），改按原价新购，旧会员继续有效至到期
  const creditWindowClosed = higherThanCurrent && upgradeCreditOpen === false;
  const isUpgradeTarget = !isContact && higherThanCurrent && !creditWindowClosed;

  // ✓/✗ 权益清单：读矩阵 bool/enum 行；额度行由价格块下方 quotaDisplay 展示
  const chips = getPlanFeatureChips(table, plan.plan_code);
  const quotaDisplay = getPlanQuotaDisplay(table, plan.plan_code);
  const quotaText =
    quotaDisplay == null ? null
      : quotaDisplay === "不限" ? t("membershipUnlimited")
        : `${quotaDisplay} ${t("membershipUnlocks")}`;

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
        <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
          {audienceLabel}
        </span>
        <h3 className="text-base font-extrabold leading-tight">{plan.name_zh}</h3>
        {plan.positioning_zh && <p className="mt-1 text-xs text-white/85 line-clamp-2">{plan.positioning_zh}</p>}
      </div>

      {/* ═══ 价格块 ═══ */}
      <div className="px-5 pt-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
          {isContact ? (
            <span className="text-xl font-extrabold tracking-tight text-slate-900">{t("membershipContactConsult")}</span>
          ) : (
            <span className="text-2xl font-extrabold tracking-tight text-slate-900">
              {symbol}
              {Number(plan.price).toLocaleString()}
              {plan.billing_period_days != null && Number(plan.billing_period_days) >= 360 && (
                <span className="text-sm font-medium text-slate-500">/{t("membershipYear")}</span>
              )}
            </span>
          )}
          <p className="mt-0.5 text-2xs text-slate-500">
            {plan.billing_period_days
              ? `${plan.billing_period_days}${t("membershipDays")}`
              : t("membershipValidityPermanent")}
            {quotaText ? ` · ${quotaText}` : ""}
          </p>
        </div>
      </div>

      {/* ═══ ✓/✗ 权益清单（读服务端矩阵逐格）═══ */}
      <ul className="flex-1 space-y-1.5 px-5 py-4">
        {chips.map((chip) => (
          <li
            key={chip.benefit_code}
            className={`flex items-center gap-2 text-xs ${chip.cell.enabled ? "text-slate-700" : "text-slate-400"}`}
          >
            {chip.cell.enabled ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            )}
            <span className={chip.cell.enabled ? "" : "line-through decoration-slate-300"}>{chip.label}</span>
          </li>
        ))}
      </ul>

      {/* ═══ CTA ═══ */}
      <div className="px-5 pb-5">
        {isContact ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onBuy(plan)}
            className="w-full rounded-xl py-2.5 text-sm"
          >
            {t("membershipContactConsult")}
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : isUpgradeTarget ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => onUpgrade?.(plan)}
            className="w-full rounded-xl py-2.5 text-sm"
          >
            <ArrowUpCircle className="w-4 h-4" />
            {t("upgradeBtn")} {symbol}
            {priceDiff.toLocaleString()}
          </Button>
        ) : creditWindowClosed ? (
          <div className="w-full space-y-1.5">
            <Button
              type="button"
              variant="cta"
              onClick={() => onBuy(plan)}
              className="w-full rounded-xl py-2.5 text-sm"
            >
              {t("upgradeBuyNewBtn")}
              <ArrowRight className="w-4 h-4" />
            </Button>
            <p className="text-2xs leading-relaxed text-slate-500">
              {t("upgradeCreditClosedNote", { days: upgradeCreditDays ?? "", price: `${symbol}${Number(plan.price).toLocaleString()}` })}
            </p>
          </div>
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
