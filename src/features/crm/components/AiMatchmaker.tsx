/**
 * CRM AI 智能匹配面板
 * CRM AI Matchmaker
 *
 * @module features/crm/components/AiMatchmaker
 */

import { Sparkles } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { OPPORTUNITIES } from "@/data";
import type { Supplier, Opportunity } from "@/types";
import { Button, Select } from "@/shared/ui";

type AiMatchmakerProps = {
  suppliers: Supplier[];
  selectedSupplier: Supplier | null;
  selectedOpportunity: Opportunity | null;
  isMatching: boolean;
  report: string;
  onSelectSupplier: (s: Supplier) => void;
  onSelectOpportunity: (o: Opportunity) => void;
  onTrigger: () => void;
  labels: {
    title: string;
    description: string;
    selectSupplier: string;
    selectOpportunity: string;
    analyzing: string;
    trigger: string;
    resultTitle: string;
    resultBadge: string;
  };
};

export function AiMatchmaker({
  suppliers,
  selectedSupplier,
  selectedOpportunity,
  isMatching,
  report,
  onSelectSupplier,
  onSelectOpportunity,
  onTrigger,
  labels,
}: AiMatchmakerProps) {
  const { locale } = useLocale();

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 rounded-2xl p-5 border border-slate-900 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="bg-teal-500 text-slate-900 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-teal-400">{labels.title}</h3>
            <p className="text-[11px] text-slate-400">{labels.description}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">1. {labels.selectSupplier}</span>
          <Select
            value={selectedSupplier ? selectedSupplier.id : ""}
            onChange={(e) => {
              const found = suppliers.find((x) => x.id === e.target.value);
              if (found) onSelectSupplier(found);
            }}
            className="bg-slate-700 text-white rounded px-2 py-1"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {pickLocale(locale, s.nameZh, s.nameEn)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-400">2. {labels.selectOpportunity}</span>
          <Select
            value={selectedOpportunity ? selectedOpportunity.id : ""}
            onChange={(e) => {
              const found = OPPORTUNITIES.find((x) => x.id === e.target.value);
              if (found) onSelectOpportunity(found);
            }}
            className="bg-slate-700 text-white rounded px-2 py-1"
          >
            {OPPORTUNITIES.map((o) => (
              <option key={o.id} value={o.id}>
                {pickLocale(locale, o.titleZh, o.titleEn)}
              </option>
            ))}
          </Select>
        </div>

        <Button
          onClick={onTrigger}
          loading={isMatching}
          size="sm"
          className="w-full py-2.5 mt-2"
        >
          {isMatching ? labels.analyzing : labels.trigger}
        </Button>
      </div>

      {report && (
        <div className="mt-4 p-4 rounded-xl bg-slate-800 border border-slate-700/60 text-xs max-h-80 overflow-y-auto leading-relaxed scrollbar-thin">
          <div className="flex justify-between items-center border-b border-slate-750 pb-1.5 mb-2.5">
            <span className="font-extrabold text-teal-400">{labels.resultTitle}</span>
            <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase">
              {labels.resultBadge}
            </span>
          </div>
          <div className="whitespace-pre-wrap text-slate-300 prose prose-invert font-sans space-y-2">
            {report}
          </div>
        </div>
      )}
    </div>
  );
}

AiMatchmaker.displayName = "AiMatchmaker";
