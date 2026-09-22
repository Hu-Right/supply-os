/**
 * 发布确认摘要项 — 用于第三步发布前确认
 * @module features/rfq/components/RfqWizard/ui/SummaryItem
 */
import { Pencil } from "lucide-react";

export function SummaryItem({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-secondary-100 last:border-0">
      <div>
        <dt className="text-2xs text-secondary-400 mb-0.5">{label}</dt>
        <dd className="text-sm text-secondary-800 break-words">{value || <span className="text-secondary-300">未填写</span>}</dd>
      </div>
      <button type="button" onClick={onEdit} className="text-2xs text-teal-600 hover:text-teal-700 font-bold flex items-center gap-0.5 shrink-0 ml-3">
        <Pencil className="w-3 h-3" /> 修改
      </button>
    </div>
  );
}
