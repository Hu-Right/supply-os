/**
 * 权益对比表组件
 * Plan Comparison Table Component
 *
 * @module features/membership/components/PlanComparisonTable
 * @description 权益矩阵展示——行/档位判定全部来自 lib/services/benefit-matrix（SSOT），
 *              与后端闸门完全同源，杜绝组件内再各自拼装档位逻辑。
 *              V2（2026-09-21）：由 benefit_rank 驱动（旧按 plan_code→tier 的映射已废弃）。
 */

import { useState, Fragment, useMemo } from "react";
import { Check, X, Filter } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { ToggleButton } from "@/shared/ui";
import type { MembershipPlan } from "@/types";
import { COMPARISON_ROWS, comparisonRowEnabled, type ComparisonRow } from "@/lib/services/benefit-matrix";

interface PlanComparisonTableProps {
  plans: MembershipPlan[];
}

/** 分组 → 复用的已有 i18n 表头键 */
const GROUP_HEADER_KEY: Record<ComparisonRow["group"], string> = {
  core: "comparisonCoreBenefits",
  advanced: "comparisonAdditionalServices",
};

export function PlanComparisonTable({ plans }: PlanComparisonTableProps) {
  const { t } = useLocale();
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const planCodes = plans.map((p) => p.plan_code);

  const groups = useMemo(() => {
    // 单行 × 单套餐 → 展示值（额度/有效期为字符串，其余为布尔门控）
    const cellValue = (plan: MembershipPlan, row: ComparisonRow): string | boolean => {
      if (row.render === "quota") {
        return plan.unlock_quota >= 9999
          ? (t("membershipUnlimited") as string)
          : `${plan.unlock_quota}${t("membershipUnlocks")}`;
      }
      if (row.render === "validity") {
        return plan.duration_days
          ? `${plan.duration_days}${t("membershipDays")}`
          : (t("membershipValidityPermanent") as string);
      }
      return comparisonRowEnabled(Number(plan.benefit_rank ?? 0), row);
    };

    const order: ComparisonRow["group"][] = ["core", "advanced"];
    return order.map((group) => ({
      group,
      categoryKey: GROUP_HEADER_KEY[group],
      features: COMPARISON_ROWS.filter((r) => r.group === group).map((row) => ({
        key: row.key,
        label: row.i18nKey ? (t(row.i18nKey) as string) : row.label,
        values: Object.fromEntries(plans.map((p) => [p.plan_code, cellValue(p, row)])),
      })),
    }));
  }, [plans, t]);

  const filterFeatures = (features: { key: string; label: string; values: Record<string, string | boolean> }[]) => {
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
            {groups.map((category, catIdx) => {
              const filteredFeatures = filterFeatures(category.features);
              if (filteredFeatures.length === 0) return null;

              return (
                <Fragment key={category.group}>
                  {catIdx > 0 && <tr><td colSpan={plans.length + 1} className="h-3" /></tr>}
                  <tr className="bg-slate-50/60 border-b border-slate-200/40">
                    <td
                      colSpan={plans.length + 1}
                      className="px-6 py-2.5 text-3xs font-bold text-slate-400 uppercase tracking-widest"
                    >
                      {t(category.categoryKey as never)}
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
                        {feature.label}
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
