/**
 * 芯片切换组（多选 / 单选）
 * Chip Toggle Group
 *
 * @module shared/ui/ChipToggleGroup
 * @description 资质/候选词等小尺寸芯片选择器。multiple=true（默认）为多选
 *              （selected 数组 + onToggle）；multiple=false 为单选 chips
 *              （选中即置 value，再点取消）。收编 CompanyInfoSection/
 *              TrainingPage 资质多选与 QualificationFormFields 选择器。
 */

import { type ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface ChipToggleItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ChipToggleGroupProps {
  items: ChipToggleItem[];
  /** 多选：已选值数组；单选：当前值（用 selected[0] 语义） */
  selected: string[];
  /** 多选：切换成员；单选：设置/取消值 */
  onToggle: (value: string) => void;
  /** 多选模式（默认）。false = 单选 chips */
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ChipToggleGroup({
  items,
  selected,
  onToggle,
  multiple = true,
  disabled = false,
  className,
}: ChipToggleGroupProps) {
  return (
    <div
      role="group"
      aria-multiselectable={multiple}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {items.map((item) => {
        const active = multiple
          ? selected.includes(item.value)
          : selected[0] === item.value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={disabled || item.disabled}
            onClick={() => onToggle(item.value)}
            className={cn(
              "cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary-600 bg-primary-600 text-white"
                : "border-secondary-200 bg-white text-secondary-600 hover:border-primary-400 hover:text-primary-700",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

ChipToggleGroup.displayName = "ChipToggleGroup";
