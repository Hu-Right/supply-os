/**
 * 撮合选择器
 * Match Selector Component
 *
 * @module features/crm/components/DigitalAssistant/MatchSelector
 * @description 在对话流中嵌入供应商 + 商机下拉选择器，触发 AI 撮合
 *              Inline supplier + opportunity selector in chat flow, triggers AI matching
 */

import { useLocale, pickLocale } from "@/core/i18n";
import { Button, Select } from "@/shared/ui";
import { Sparkles } from "lucide-react";
import type { Supplier, Opportunity } from "@/types";

type MatchSelectorProps = {
  suppliers: Supplier[];
  opportunities: Opportunity[];
  selectedSupplier: Supplier | null;
  selectedOpportunity: Opportunity | null;
  isMatching: boolean;
  onSelectSupplier: (s: Supplier) => void;
  onSelectOpportunity: (o: Opportunity) => void;
  onTrigger: () => void;
  t: (key: string) => string;
};

export function MatchSelector({
  suppliers,
  opportunities,
  selectedSupplier,
  selectedOpportunity,
  isMatching,
  onSelectSupplier,
  onSelectOpportunity,
  onTrigger,
  t,
}: MatchSelectorProps) {
  const { locale } = useLocale();

  return (
    <div className="my-3 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="bg-teal-500 text-slate-900 p-1 rounded-lg">
          <Sparkles className="w-4 h-4 animate-pulse" />
        </div>
        <p className="text-xs font-bold text-teal-400">{t("aiMatchmaking")}</p>
      </div>

      {/* Supplier Select */}
      <div className="flex items-center justify-between gap-3 bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700">
        <span className="text-3xs text-slate-400 shrink-0">1. {t("crmMatchSelectSupplier")}</span>
        <Select
          value={selectedSupplier?.id ?? ""}
          onChange={(e) => {
            const found = suppliers.find((s) => s.id === e.target.value);
            if (found) onSelectSupplier(found);
          }}
          className="bg-slate-700 text-white text-xs rounded px-2 py-1 max-w-[180px]"
        >
          <option value="">{t("crmMatchChoose")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {pickLocale(locale, s.nameZh, s.nameEn)}
            </option>
          ))}
        </Select>
      </div>

      {/* Opportunity Select */}
      <div className="flex items-center justify-between gap-3 bg-slate-800/80 rounded-lg px-3 py-2 border border-slate-700">
        <span className="text-3xs text-slate-400 shrink-0">2. {t("crmMatchSelectOpp")}</span>
        <Select
          value={selectedOpportunity?.id ?? ""}
          onChange={(e) => {
            const found = opportunities.find((o) => o.id === e.target.value);
            if (found) onSelectOpportunity(found);
          }}
          className="bg-slate-700 text-white text-xs rounded px-2 py-1 max-w-[180px]"
        >
          <option value="">{t("crmMatchChoose")}</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {pickLocale(locale, o.titleZh, o.titleEn)}
            </option>
          ))}
        </Select>
      </div>

      {/* Trigger Button */}
      <Button
        type="button"
        onClick={onTrigger}
        disabled={isMatching || !selectedSupplier || !selectedOpportunity}
        size="sm"
        className="w-full py-2.5"
      >
        {isMatching ? t("aiAnalyzing") : t("clickAiMatch")}
      </Button>
    </div>
  );
}

MatchSelector.displayName = "MatchSelector";
