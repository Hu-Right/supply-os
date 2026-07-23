/**
 * CRM 商机列表
 * CRM Opportunity List
 *
 * @module features/crm/components/OpportunityList
 */

import { useLocale, pickLocale } from "@/core/i18n";
import { OPPORTUNITIES } from "@/data";
import type { Opportunity } from "@/types";

type OpportunityListProps = {
  selectedOpportunity: Opportunity | null;
  onSelect: (opp: Opportunity) => void;
  onSubscribe: () => void;
  labels: {
    opportunityHub: string;
    latestNotices: string;
    subscribe: string;
  };
  deadlineLabel: (deadline: string) => string;
};

export function OpportunityList({
  selectedOpportunity,
  onSelect,
  onSubscribe,
  labels,
  deadlineLabel,
}: OpportunityListProps) {
  const { locale } = useLocale();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
      <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center justify-between">
        <span>{labels.opportunityHub}</span>
        <span className="text-xs text-teal-600 font-mono">{labels.latestNotices}</span>
      </h3>
      <div className="space-y-4">
        {OPPORTUNITIES.map((opp) => (
          <div
            key={opp.id}
            onClick={() => onSelect(opp)}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedOpportunity?.id === opp.id
                ? "bg-gradient-to-tr from-slate-50 to-teal-55/15 border-teal-500 shadow-sm"
                : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                {pickLocale(locale, opp.industryZh, opp.industryEn)}
              </span>
              <span className="text-xs font-semibold text-teal-700">{opp.budget}</span>
            </div>
            <h4 className="text-sm font-bold text-slate-800 mt-2 line-clamp-1">
              {pickLocale(locale, opp.titleZh, opp.titleEn)}
            </h4>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {pickLocale(locale, opp.descriptionZh, opp.descriptionEn)}
            </p>
            <div className="mt-3 flex justify-between items-center border-t border-slate-200/50 pt-2 text-[11px] text-slate-400">
              <span>{deadlineLabel(opp.deadline)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSubscribe();
                }}
                className="bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 font-bold"
              >
                {labels.subscribe}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

OpportunityList.displayName = "OpportunityList";
