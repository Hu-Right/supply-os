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
import { ToggleButton } from "@/shared/ui";
import type { MembershipPlan } from "@/types";
import { getPlanTier } from "../utils";

interface PlanComparisonTableProps {
  plans: MembershipPlan[];
}

/**
 * 套餐等级映射已统一迁至 ../utils（getPlanTier），与卡片特色列表共用，避免两处前缀兜底串档。
 */

/**
 * 增值服务特性定义（按当前数据库 4 档套餐 tier 驱动勾选）
 *   trial=个人体验版  standard=个人标准版  pro=个人专业版  enterprise=企业年度会员
 */
const ADDITIONAL_SERVICES: { key: string; labelKey: string; tiers: Record<string, boolean> }[] = [
  {
    key: "report",
    labelKey: "comparisonReport",
    tiers: { pro: true, enterprise: true },
  },
  {
    key: "bid_history",
    labelKey: "comparisonBidHistory",
    tiers: { standard: true, pro: true, enterprise: true },
  },
  {
    key: "ai_scoring",
    labelKey: "comparisonAiScoring",
    tiers: { pro: true, enterprise: true },
  },
  {
    key: "industry_push",
    labelKey: "comparisonIndustryPush",
    tiers: { pro: true, enterprise: true },
  },
  {
    key: "enterprise_profile",
    labelKey: "comparisonEnterpriseProfile",
    tiers: { enterprise: true },
  },
  {
    key: "consortium_bid",
    labelKey: "comparisonConsortiumBid",
    tiers: { enterprise: true },
  },
  {
    key: "contract_sign",
    labelKey: "comparisonContractSign",
    tiers: { enterprise: true },
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
        <ToggleButton
          pressed={showDiffOnly}
          onClick={() => setShowDiffOnly(!showDiffOnly)}
          tone="amber"
          className="py-1.5 text-xs font-semibold"
        >
          {t("membershipComparisonShowDiffOnly")}
        </ToggleButton>
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
                      className="px-6 py-2.5 text-3xs font-bold text-slate-400 uppercase tracking-widest"
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
