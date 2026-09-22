/**
 * CRM 商机漏斗图
 * CRM Opportunity Funnel Chart
 *
 * @module features/crm/components/CrmFunnelChart
 * @description 展示商机从新匹配到已提交的漏斗分布
 */
import { ChevronDown } from "lucide-react";

const FUNNEL_DATA = [
  { label: "新匹配", value: 23, color: "bg-teal-500" },
  { label: "已收藏", value: 12, color: "bg-teal-400" },
  { label: "评估中", value: 7, color: "bg-teal-300" },
  { label: "准备投标", value: 3, color: "bg-teal-200" },
  { label: "已提交", value: 1, color: "bg-teal-100" },
];

export function CrmFunnelChart() {
  const maxFunnel = Math.max(...FUNNEL_DATA.map((f) => f.value));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-extrabold text-slate-900">我的商机漏斗</h3>
        <button className="text-xs text-slate-500 flex items-center gap-1">
          全部国家 <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-4">
        {FUNNEL_DATA.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-16 text-sm font-bold text-slate-700 shrink-0">{item.label}</span>
            <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${item.color} rounded-full transition-all`}
                style={{ width: `${(item.value / maxFunnel) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm font-extrabold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

CrmFunnelChart.displayName = "CrmFunnelChart";
