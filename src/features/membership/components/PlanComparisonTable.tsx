/**
 * 权益对比表组件
 * Plan Comparison Table Component
 *
 * @module features/membership/components/PlanComparisonTable
 * @description 根据实际传入的套餐动态生成权益对比表。
 *              基础数据（额度、有效期）从 plan 对象读取，
 *              增值服务数据从配置映射读取。
 */

import { useState, Fragment, useMemo } from "react";
import { Check, X, Filter } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { MembershipPlan } from "@/types";

interface PlanComparisonTableProps {
  plans: MembershipPlan[];
}

/**
 * 套餐等级映射
 * 按 plan_code 精确匹配，确保各套餐正确映射到对应权益层级
 *
 * 数据库实际 plan_code 列表：
 *   single_89, single_199          → single
 *   trial_99_3, annual_799         → personal
 *   week_299_21, annual_5600       → enterprise_basic
 *   annual_8800, annual_manual_8800, annual_8 → annual_basic
 *   annual_16800                   → enterprise_flagship
 *   annual_26800                   → enterprise_premium
 */
function getPlanTier(planCode: string): string {
  // 精确匹配（优先）
  if (planCode === "annual_16800") return "enterprise_flagship";
  if (planCode === "annual_26800") return "enterprise_premium";
  if (planCode === "annual_8800" || planCode === "annual_manual_8800" || planCode === "annual_8") return "annual_basic";
  if (planCode === "annual_5600") return "enterprise_basic";
  if (planCode === "annual_799") return "personal";
  
  // 前缀匹配（兜底）
  if (planCode.startsWith("single")) return "single";
  if (planCode.startsWith("personal") || planCode.startsWith("trial")) return "personal";
  if (planCode.startsWith("enterprise_premium")) return "enterprise_premium";
  if (planCode.startsWith("enterprise_flagship")) return "enterprise_flagship";
  if (planCode.startsWith("enterprise")) return "enterprise_basic";
  if (planCode.startsWith("annual")) return "annual";
  if (planCode.startsWith("week")) return "personal";
  return "single";
}

/**
 * 增值服务特性定义
 * annual_basic: 年度会员基础版（annual_8800）— 仅有外贸交流群 + 专属客服
 * annual: 年度会员完整版（其他 annual_* 套餐）— 含一对一服务群 + 合同签约
 */
const ADDITIONAL_SERVICES: { key: string; labelKey: string; tiers: Record<string, boolean> }[] = [
  {
    key: "trade_group",
    labelKey: "comparisonTradeGroup",
    tiers: { personal: true, enterprise_basic: true, enterprise_flagship: true, enterprise_premium: true, annual_basic: true, annual: true },
  },
  {
    key: "supplier_library",
    labelKey: "comparisonSupplierLibrary",
    tiers: { enterprise_basic: true, enterprise_flagship: true, enterprise_premium: true, annual_basic: true },
  },
  {
    key: "dedicated_support",
    labelKey: "comparisonDedicatedSupport",
    tiers: { enterprise_basic: true, enterprise_flagship: true, enterprise_premium: true, annual_basic: true, annual: true },
  },
  {
    key: "private_group",
    labelKey: "comparisonPrivateGroup",
    tiers: { enterprise_flagship: true, enterprise_premium: true, annual: true },
  },
  {
    key: "ungm_reg",
    labelKey: "comparisonUngmReg",
    tiers: { enterprise_flagship: true, enterprise_premium: true },
  },
  {
    key: "bid_support",
    labelKey: "comparisonBidSupport",
    tiers: { enterprise_premium: true },
  },
  {
    key: "contract_sign",
    labelKey: "comparisonContractSign",
    tiers: { enterprise_flagship: true, enterprise_premium: true, annual: true },
  },
];

export function PlanComparisonTable({ plans }: PlanComparisonTableProps) {
  const { t } = useLocale();
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const planCodes = plans.map((p) => p.plan_code);

  const comparisonRows = useMemo(() => {
    // 核心权益 — 从 plan 对象直接读取
    const coreFeatures = [
      {
        key: "unlock_quota",
        labelKey: "comparisonUnlockQuota",
        values: Object.fromEntries(plans.map((p) => [
          p.plan_code,
          p.unlock_quota >= 9999 ? (t("membershipUnlimited") as string) : `${p.unlock_quota}${t("membershipUnlocks")}`,
        ])),
      },
      {
        key: "validity",
        labelKey: "comparisonValidity",
        values: Object.fromEntries(plans.map((p) => [
          p.plan_code,
          p.duration_days ? `${p.duration_days}${t("membershipDays")}` : (t("membershipValidityPermanent") as string),
        ])),
      },
      {
        key: "original_link",
        labelKey: "comparisonOriginalLink",
        values: Object.fromEntries(plans.map((p) => [p.plan_code, true])),
      },
      {
        key: "doc_download",
        labelKey: "comparisonDocDownload",
        values: Object.fromEntries(plans.map((p) => [p.plan_code, true])),
      },
      {
        key: "report",
        labelKey: "comparisonReport",
        values: Object.fromEntries(plans.map((p) => [p.plan_code, true])),
      },
    ];

    // 增值服务 — 从 tier 映射读取
    const additionalFeatures = ADDITIONAL_SERVICES.map((svc) => ({
      key: svc.key,
      labelKey: svc.labelKey,
      values: Object.fromEntries(plans.map((p) => {
        const tier = getPlanTier(p.plan_code);
        return [p.plan_code, svc.tiers[tier] ?? false];
      })),
    }));

    return [
      { category: "核心权益", categoryKey: "comparisonCoreBenefits", features: coreFeatures },
      { category: "增值服务", categoryKey: "comparisonAdditionalServices", features: additionalFeatures },
    ];
  }, [plans, t]);

  const filterFeatures = (features: { key: string; labelKey: string; values: Record<string, string | boolean> }[]) => {
    if (!showDiffOnly) return features;
    return features.filter((feature) => {
      const values = planCodes.map((code) => feature.values[code]);
      const uniqueValues = new Set(values.map((v) => String(v)));
      return uniqueValues.size > 1;
    });
  };

  const renderValue = (value: string | boolean) => {
    if (typeof value === "boolean") {
      return value ? (
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full bg-teal-100/80 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-teal-600" />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full bg-slate-100/60 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      );
    }
    return <span className="text-sm font-semibold text-slate-700">{value}</span>;
  };

  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-slate-200/50 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            {t("membershipComparisonTitle")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDiffOnly(!showDiffOnly)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            showDiffOnly
              ? "bg-amber-100/80 text-amber-700 border border-amber-200/60"
              : "bg-white/80 text-slate-500 border border-slate-200/60 hover:bg-slate-50"
          }`}
        >
          {t("membershipComparisonShowDiffOnly")}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200/50">
              <th className="sticky left-0 z-10 bg-white/90 backdrop-blur-sm px-6 py-4 text-left text-sm font-bold text-slate-900 min-w-[180px]">
                {t("membershipComparisonFeature")}
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.plan_code}
                  className="px-4 py-4 text-center text-sm font-bold text-slate-900 min-w-[110px]"
                >
                  <span className="text-xs text-slate-500 font-medium">{plan.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((category, catIdx) => {
              const filteredFeatures = filterFeatures(category.features);
              if (filteredFeatures.length === 0) return null;

              return (
                <Fragment key={category.category}>
                  {catIdx > 0 && <tr><td colSpan={plans.length + 1} className="h-3" /></tr>}
                  <tr className="bg-slate-50/60 border-b border-slate-200/40">
                    <td
                      colSpan={plans.length + 1}
                      className="px-6 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest"
                    >
                      {t(category.categoryKey as any)}
                    </td>
                  </tr>
                  {filteredFeatures.map((feature, featIdx) => (
                    <tr
                      key={feature.key}
                      className={`border-b border-slate-100/40 ${
                        featIdx % 2 === 0 ? "bg-white/40" : "bg-slate-50/30"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-6 py-3.5 text-sm font-medium text-slate-700">
                        {t(feature.labelKey as any)}
                      </td>
                      {planCodes.map((code) => (
                        <td key={code} className="px-4 py-3.5 text-center">
                          {renderValue(feature.values[code] ?? false)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

PlanComparisonTable.displayName = "PlanComparisonTable";
