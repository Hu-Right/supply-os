/**
 * 字段容器组件 — RFQ 向导表单字段的标签、控件插槽、错误提示
 * @module features/rfq/components/RfqWizard/ui/Field
 */
import { AlertTriangle } from "lucide-react";

export function Field({ label, required, error, hint, counter, htmlFor, children }: {
  label: string; required?: boolean; error?: string; hint?: string; counter?: string;
  htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-bold text-secondary-800">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {counter && <span className="text-2xs text-secondary-400">{counter}</span>}
      </div>
      {children}
      {hint && !error && <p className="text-2xs text-secondary-400">{hint}</p>}
      {error && (
        <p className="text-2xs text-rose-600 flex items-center gap-1" data-error="true">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}
