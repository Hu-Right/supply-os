/**
 * CRM 线索卡片
 * CRM Lead Card
 *
 * @module features/crm/components/LeadCard
 */

import { Clock } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { Lead } from "@/types";

type LeadCardProps = {
  lead: Lead;
  isActive: boolean;
  onClick: () => void;
  labels: {
    fieldIndustry: string;
    fieldCountry: string;
    fieldContact: string;
    fieldMethod: string;
    fieldNotes: string;
    industryUnknown: string;
    followUpCount: (num: number) => string;
  };
};

export function LeadCard({ lead, isActive, onClick, labels }: LeadCardProps) {
  const { locale } = useLocale();

  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
        isActive
          ? "bg-slate-50 border-teal-500 shadow-xs"
          : "border-slate-100 bg-slate-50/20 hover:bg-slate-55"
      }`}
    >
      <div className="flex justify-between items-start">
        <strong className="text-sm text-slate-800 line-clamp-1">{lead.companyName}</strong>
        <span
          className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase ${
            lead.status === "new"
              ? "bg-rose-100 text-rose-800"
              : lead.status === "contacted"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {lead.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px] text-slate-500 border-b border-dashed border-slate-150 pb-2">
        <p>
          <strong>{labels.fieldIndustry}:</strong> {lead.industry || labels.industryUnknown}
        </p>
        <p>
          <strong>{labels.fieldCountry}:</strong> {lead.country || "China"}
        </p>
        <p>
          <strong>{labels.fieldContact}:</strong> {lead.contactPerson}
        </p>
        <p className="truncate">
          <strong>{labels.fieldMethod}:</strong> {lead.contactMethod}
        </p>
      </div>

      <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded leading-relaxed border border-slate-100">
        <strong>{labels.fieldNotes}:</strong> {lead.notes}
      </p>

      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2">
        <span className="flex items-center">
          <Clock className="w-3 h-3 mr-1" />
          {new Date(lead.createdAt).toLocaleString(pickLocale(locale, "zh-CN", "en-US"))}
        </span>
        <span className="text-teal-600 hover:underline">
          {labels.followUpCount(lead.followUpLogs?.length || 0)}
        </span>
      </div>
    </div>
  );
}

LeadCard.displayName = "LeadCard";
