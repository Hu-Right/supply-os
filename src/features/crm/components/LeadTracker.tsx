/**
 * CRM 线索追踪器
 * CRM Lead Tracker
 *
 * @module features/crm/components/LeadTracker
 */

import { useState } from "react";
import type { Lead } from "@/types";
import { LeadCard } from "./LeadCard";
import { FollowUpLogPanel } from "./FollowUpLogPanel";

type LeadTrackerProps = {
  leads: Lead[];
  isLoading: boolean;
  onSubmitLog: (leadId: string, content: string, nextStatus?: string) => Promise<Lead | null>;
  labels: {
    title: string;
    badge: string;
    description: string;
    loadingLeads: string;
    fieldIndustry: string;
    fieldCountry: string;
    fieldContact: string;
    fieldMethod: string;
    fieldNotes: string;
    industryUnknown: string;
    followUpCount: (num: number) => string;
    editingLead: (company: string) => string;
    followUpLogs: string;
    noLogs: string;
    logPlaceholder: string;
    leadPhase: string;
    saveToCRM: string;
    saveFailed: string;
  };
};

export function LeadTracker({ leads, isLoading, onSubmitLog, labels }: LeadTrackerProps) {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // 提交跟进日志：落库后用返回的线索即时更新时间线
  const handleSubmitLog = async (leadId: string, content: string, nextStatus?: string) => {
    const updated = await onSubmitLog(leadId, content, nextStatus);
    if (updated) setActiveLead(updated);
    return updated;
  };

  const cardLabels = {
    fieldIndustry: labels.fieldIndustry,
    fieldCountry: labels.fieldCountry,
    fieldContact: labels.fieldContact,
    fieldMethod: labels.fieldMethod,
    fieldNotes: labels.fieldNotes,
    industryUnknown: labels.industryUnknown,
    followUpCount: labels.followUpCount,
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
      <div>
        <h3 className="text-base font-extrabold text-slate-800 flex items-center justify-between">
          <span>{labels.title}</span>
          <span className="text-[10px] bg-teal-600 text-white font-mono px-2 py-0.5 rounded-full">
            {labels.badge}
          </span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">{labels.description}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-slate-400 text-xs animate-pulse">{labels.loadingLeads}</div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pe-1">
          {leads.map((lead, idx) => (
            <LeadCard
              key={lead.id || `lead-${idx}`}
              lead={lead}
              isActive={activeLead?.id === lead.id}
              onClick={() => setActiveLead(lead)}
              labels={cardLabels}
            />
          ))}
        </div>
      )}

      {activeLead && (
        <FollowUpLogPanel
          lead={activeLead}
          onClose={() => setActiveLead(null)}
          onSubmit={handleSubmitLog}
          labels={{
            editingLead: labels.editingLead,
            followUpLogs: labels.followUpLogs,
            noLogs: labels.noLogs,
            logPlaceholder: labels.logPlaceholder,
            leadPhase: labels.leadPhase,
            saveToCRM: labels.saveToCRM,
            saveFailed: labels.saveFailed,
          }}
        />
      )}
    </div>
  );
}

LeadTracker.displayName = "LeadTracker";
