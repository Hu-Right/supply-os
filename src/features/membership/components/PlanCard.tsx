/**
 * 套餐卡（周期 Tab 下的档位卡：个人版 / 企业版 / 人工对接）
 * Plan Card Component
 *
 * @module features/membership/components/PlanCard
 * @description 定价页布局：顶部「月 / 季度 / 年」三个 Tab，每个 Tab 下三张档位卡。
 *              卡片消费服务端解析好的 ComparisonView：
 *              - 卡头 = 档位名（tier 未登记时回退代表行名）+ 定位；
 *              - 价格/成交 = 当前 Tab 周期行（row），买哪张卡就下哪张卡的单；
 *              - ✓/✗ 权益清单 = 矩阵按**代表行** planCode 取格（同档三周期权益相同）；
 *              - 推荐角标读周期行自身的 badge（如企业年付 most_popular）。
 */
import { ArrowRight, ArrowUpCircle, Check, Sparkles, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { ComparisonView, PlanView, TieredPlanView } from "@/types";
import {
  getPlanFeatureChips, getPlanQuotaDisplay, isRecommendedPlan,
  periodUnitKey, tierDisplayName,
} from "../utils";

export interface PlanCardProps {
  /** 档位（代表行 + 档内全部周期子行）：卡头档名/定位与权益矩阵键取它 */
  tier: TieredPlanView;
  /** 本卡当前 Tab 对应的周期行（月/季/年之一）：价格与成交全部落在它上面 */
  row: PlanView;
  /** 服务端解析的完整对比矩阵（卡内权益清单按代表行 planCode 取格） */
  table: ComparisonView;
  /** 用户当前有效订阅套餐价格（null = 无可升级订阅） */
  currentPlanPrice?: number | null;
  /** 用户当前有效订阅套餐 code */
  currentPlanCode?: string | null;
  onBuy: (plan: PlanView) => void;
  /** 升级回调（本周期行明码价高于当前订阅时触发） */
  onUpgrade?: (plan: PlanView) => void;
  /**
   * 当前订阅的升级全额抵扣窗口是否仍开着（服务端按目录 upgradeCreditDays 算好下发）：
   * false = 已过窗口，不给「升级补差价」入口，改走按原价新购；null/undefined = 本档无窗口约束（沿用升级补差价）。
   */
  upgradeCreditOpen?: boolean | null;
}

export function PlanCard({
  tier, row, table, currentPlanPrice, currentPlanCode, onBuy, onUpgrade, upgradeCreditOpen,
}: PlanCardProps) {
  const { t } = useLocale();
  const recommended = isRecommendedPlan(row);
  const symbol = row.currency === "CNY" ? "¥" : "$";
  const tierName = tierDisplayName(tier);
  const priceUnit = row.billingPeriodDays == null ? null : t(periodUnitKey(row.billingPeriodDays));
  const isContact = row.priceMode === "contact";

  // 升级判断：存在可升级的固定价订阅（数据驱动）；本周期行明码价高于当前订阅价才算
  const hasUpgradeablePlan = Boolean(currentPlanCode) && Number(currentPlanPrice || 0) > 0;
  const priceDiff = Number(row.price) - Number(currentPlanPrice || 0);
  const higherThanCurrent = hasUpgradeablePlan && priceDiff > 0;
  // 抵扣窗口已关：不能再走「升级补差价」，改按原价新购，旧会员继续有效至到期
  const creditWindowClosed = higherThanCurrent && upgradeCreditOpen === false;

  // ✓/✗ 权益清单与额度：键 = 代表行 planCode（同档三周期矩阵值相同）
  // 按产品口径「展示全部权益 + 当前档是否拥有」：平铺全部行，✓/✗ 逐条；未上线权益带「即将上线」角标
  const chips = getPlanFeatureChips(table, tier.planCode);
  const quotaDisplay = getPlanQuotaDisplay(table, tier.planCode);
  const quotaText =
    quotaDisplay == null ? null
      : quotaDisplay === "不限" ? t("membershipUnlimited")
        : `${quotaDisplay} ${t("membershipUnlocks")}`;

  /** 成交控件：联系咨询 / 升级补差 / 窗口已过按原价 / 已是会员 / 立即购买 */
  function actionButton() {
    if (isContact) {
      return (
        <Button type="button" variant="outline" onClick={() => onBuy(row)} className="w-full justify-center rounded-lg px-3 py-2 text-xs">
          {t("membershipContactConsult")}
          <ArrowRight className="w-3 h-3" />
        </Button>
      );
    }
    if (creditWindowClosed) {
      return (
        <Button type="button" variant="cta" onClick={() => onBuy(row)} className="w-full justify-center rounded-lg px-3 py-2 text-xs">
          {t("upgradeBuyNewBtn")}
        </Button>
      );
    }
    if (higherThanCurrent) {
      return (
        <Button type="button" variant="accent" onClick={() => onUpgrade?.(row)} className="w-full justify-center rounded-lg px-3 py-2 text-xs">
          <ArrowUpCircle className="w-3 h-3" />
          {t("upgradeBtn")} {symbol}{priceDiff.toLocaleString()}
        </Button>
      );
    }
    if (hasUpgradeablePlan) {
      return (
        <span className="flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <Check className="w-3 h-3" />
          {t("membershipAlreadyVip")}
        </span>
      );
    }
    return (
      <Button type="button" variant="cta" onClick={() => onBuy(row)} className="w-full justify-center rounded-lg px-3 py-2 text-xs">
        {t("membershipBuyNow")}
        <ArrowRight className="w-3 h-3" />
      </Button>
    );
  }

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-xs ${
        recommended ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
      }`}
      data-testid="plan-card"
      data-plan-code={row.planCode}
      data-billing-days={row.billingPeriodDays ?? ""}
    >
      {recommended && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-bold text-white">
          <Sparkles className="w-3 h-3" />
          {t("membershipRecommended")}
        </span>
      )}

      {/* ═══ 卡头：档位名 + 定位（周期由顶部 Tab 给出，卡内不重复）═══ */}
      <div
        className={`px-5 py-4 text-white bg-gradient-to-br ${
          recommended ? "from-amber-500 to-amber-600" : "from-primary-500 to-primary-600"
        }`}
      >
        <h3 className="text-base font-extrabold leading-tight">{tierName.nameKey ? t(tierName.nameKey) : tierName.fallback}</h3>
        {tier.positioningZh && <p className="mt-1 text-xs text-white/85 line-clamp-2">{tier.positioningZh}</p>}
      </div>

      {/* ═══ 价格块：本周期明码价 + 成交按钮 ═══ */}
      <div className="px-5 pt-4">
        {isContact ? (
          <p className="text-center text-2xl font-extrabold tracking-tight text-slate-900">{t("svcLabelContact")}</p>
        ) : (
          <p className="flex items-end justify-center gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">
              {symbol}{Number(row.price).toLocaleString()}
            </span>
            {priceUnit && <span className="pb-1 text-xs font-semibold text-slate-500">/{priceUnit}</span>}
          </p>
        )}
        <div className="mt-3">{actionButton()}</div>
        {quotaText && <p className="pt-2 text-center text-2xs text-slate-500">{quotaText}</p>}
      </div>

      {/* ═══ ✓/✗ 权益清单（全部权益平铺；2026-10-29 产品口径：不在页面展示「即将上线」角标）═══ */}
      <ul className="flex-1 space-y-1.5 px-5 py-4" data-testid="benefit-list">
        {chips.map((chip) => (
          <li
            key={chip.benefitCode}
            className={`flex items-center gap-2 text-xs ${chip.cell.enabled ? "text-slate-700" : "text-slate-400"}`}
            data-enabled={chip.cell.enabled ? "1" : "0"}
          >
            {chip.cell.enabled ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            )}
            <span className={chip.cell.enabled ? "" : "line-through decoration-slate-300"}>{chip.label}</span>
            {/* 枚举权益的等级标签（如 AI 智能匹配：个人=基础 / 企业=企业级 / 人工=可定制）：
                矩阵 level_dict 驱动，不在前端硬编码档位文案 */}
            {chip.cell.enabled && chip.cell.display && !["✓", "—", "-", ""].includes(chip.cell.display.trim()) && (
              <span className="ml-1 shrink-0 rounded bg-teal-50 px-1 py-0.5 text-[10px] font-bold leading-none text-teal-700">
                {chip.cell.display}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
