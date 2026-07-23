/**
 * CRM 跟进日志面板
 * CRM Follow-Up Log Panel
 *
 * @module features/crm/components/FollowUpLogPanel
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { Lead } from "@/types";

type FollowUpLogPanelProps = {
  lead: Lead;
  onClose: () => void;
  labels: {
    editingLead: (company: string) => string;
    followUpLogs: string;
    noLogs: string;
    logPlaceholder: string;
    leadPhase: string;
    saveToCRM: string;
  };
};

export function FollowUpLogPanel({ lead, onClose, labels }: FollowUpLogPanelProps) {
  const [newEntry, setNewEntry] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNewEntry("");
    setStatus("");
  };

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-teal-200 mt-4 space-y-4">
      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest text-teal-700">
          {labels.editingLead(lead.companyName)}
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline logs */}
      <div>
        <p className="text-[10px] text-slate-400 font-extrabold pb-2">{labels.followUpLogs}</p>
        {lead.followUpLogs && lead.followUpLogs.length > 0 ? (
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {lead.followUpLogs.map((log, lIdx) => (
              <div key={lIdx} className="bg-white p-2.5 rounded border border-slate-200 text-xs">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <strong>{log.author}</strong>
                  <span>{log.date}</span>
                </div>
                <p className="text-slate-700 mt-1 leading-relaxed">{log.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">{labels.noLogs}</div>
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
            className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-755 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-2 items-center">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded text-xs"
          >
            <option value="">{labels.leadPhase}</option>
            <option value="new">🆕 new (未联系)</option>
            <option value="contacted">📞 contacted (已对接)</option>
            <option value="qualified">✅ qualified (高意向)</option>
            <option value="lost">❌ lost (已流失)</option>
          </select>

          <button
            type="submit"
            className="flex-1 py-1 px-3 bg-slate-900 hover:bg-slate-855 text-white rounded text-xs font-semibold"
          >
            {labels.saveToCRM}
          </button>
        </div>
      </form>
    </div>
  );
}

FollowUpLogPanel.displayName = "FollowUpLogPanel";
