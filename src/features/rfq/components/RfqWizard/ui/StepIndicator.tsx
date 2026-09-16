/**
 * 步骤指示器 — 显示向导当前步骤和已完成步骤
 * @module features/rfq/components/RfqWizard/ui/StepIndicator
 */
import { Check } from "lucide-react";
import { cn } from "@/shared/utils";
import { STEP_META } from "../constants";

export function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEP_META.map((s, i) => {
        const isActive = i === step;
        const isDone = i < step;
        return (
          <div key={s.title} className="flex items-center gap-2 flex-1">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors",
              isActive && "bg-teal-600 text-white",
              isDone && "bg-teal-100 text-teal-700",
              !isActive && !isDone && "bg-secondary-100 text-secondary-500",
            )}>
              {isDone ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              "text-sm font-bold truncate",
              isActive ? "text-secondary-900" : isDone ? "text-teal-700" : "text-secondary-400",
            )}>{s.title}</span>
            {i < STEP_META.length - 1 && <div className="flex-1 h-px bg-secondary-200 mx-2" />}
          </div>
        );
      })}
    </div>
  );
}
