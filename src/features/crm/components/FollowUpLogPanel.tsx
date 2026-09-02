/**
 * CRM 跟进日志面板
 * CRM Follow-Up Log Panel
 *
 * @module features/crm/components/FollowUpLogPanel
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { Lead } from "@/types";
import { Button, Select } from "@/shared/ui";

type FollowUpLogPanelProps = {
  lead: Lead;
  onClose: () => void;
  onSubmit: (leadId: string, content: string, nextStatus?: string) => Promise<Lead | null>;
  labels: {
    editingLead: (company: string) => string;
    followUpLogs: string;
    noLogs: string;
    logPlaceholder: string;
    leadPhase: string;
    saveToCRM: string;
    saveFailed: string;
  };
};

export function FollowUpLogPanel({ lead, onClose, onSubmit, labels }: FollowUpLogPanelProps) {
  const [newEntry, setNewEntry] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const updated = await onSubmit(lead.id, newEntry, status || lead.status);
    setSubmitting(false);
    if (updated) {
      setNewEntry("");
      setStatus("");
    } else {
      setError(labels.saveFailed);
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-teal-200 mt-4 space-y-4">
      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest text-teal-700">
          {labels.editingLead(lead.companyName)}
        </h4>
        <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Timeline logs */}
      <div>
        <p className="text-2xs text-slate-400 font-extrabold pb-2">{labels.followUpLogs}</p>
        {lead.followUpLogs && lead.followUpLogs.length > 0 ? (
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {lead.followUpLogs.map((log, lIdx) => (
              <div key={lIdx} className="bg-white p-2.5 rounded border border-slate-200 text-xs">
                <div className="flex justify-between text-2xs text-slate-400">
                  <strong>{log.author}</strong>
                  <span>{log.date}</span>
                </div>
                <p className="text-slate-700 mt-1 leading-relaxed">{log.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-3xs text-slate-400 italic">{labels.noLogs}</div>
        )}
      </div>

      {/* Quick Follow up form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <textarea
            placeholder={labels.logPlaceholder}
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            rows={2}
            className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-2 items-center">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-2 py-1"
          >
            <option value="">{labels.leadPhase}</option>
            <option value="new">🆕 new (未联系)</option>
            <option value="contacted">📞 contacted (已对接)</option>
            <option value="qualified">✅ qualified (高意向)</option>
            <option value="lost">❌ lost (已流失)</option>
          </Select>

          <Button
            type="submit"
            variant="dark"
            size="sm"
            disabled={submitting}
            className="flex-1 py-1 rounded font-semibold disabled:opacity-60"
          >
            {labels.saveToCRM}
          </Button>
        </div>

        {error && <p className="text-3xs font-bold text-rose-600">{error}</p>}
      </form>
    </div>
  );
}

FollowUpLogPanel.displayName = "FollowUpLogPanel";
