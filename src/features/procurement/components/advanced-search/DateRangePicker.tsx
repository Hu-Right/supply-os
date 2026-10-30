/**
 * 日期范围选择器（自 AdvancedSearchPanel.tsx 拆出，行为不变）— Popover + Calendar。
 *
 * 纯展示组件：值与变更回调全部来自 props，无内部取数；已用 React.memo 隔离父级重渲染
 * （父面板任何输入都会重渲染容器，本组件 props 未变时应跳过）。
 *
 * @module features/procurement/components/advanced-search/DateRangePicker
 */
import { memo } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar, Popover, PopoverTrigger, PopoverContent } from "@/shared/ui";

/** 日期范围选择器 — Popover + Calendar */
export const DateRangePicker = memo(function DateRangePicker({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  placeholderFrom,
  placeholderTo,
  triggerId,
  triggerLabel,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholderFrom: string;
  placeholderTo: string;
  /** 触发按钮 id（外置 label 的 htmlFor 指向它，2026-10-30 a11y） */
  triggerId?: string;
  /** 触发按钮的 aria-label（读屏文案；视觉 label 在面板外） */
  triggerLabel?: string;
}) {
  const displayText = fromValue || toValue
    ? `${fromValue || placeholderFrom} ~ ${toValue || placeholderTo}`
    : `${placeholderFrom} ~ ${placeholderTo}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          aria-label={triggerLabel}
          className="w-full flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-left transition-colors hover:border-slate-300 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none cursor-pointer"
        >
          <span className={`flex-1 truncate ${fromValue || toValue ? "text-slate-700" : "text-slate-400"}`}>
            {displayText}
          </span>
          <CalendarIcon className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar
          mode="single"
          selected={fromValue ? new Date(fromValue) : undefined}
          onSelect={(date: Date | undefined) => {
            if (!date) return;
            const iso = date.toISOString().slice(0, 10);
            if (!fromValue || (toValue && iso < fromValue)) {
              onFromChange(iso);
              onToChange("");
            } else {
              onToChange(iso);
            }
          }}
          defaultMonth={fromValue ? new Date(fromValue) : undefined}
        />
      </PopoverContent>
    </Popover>
  );
});
