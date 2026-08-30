/**
 * 分段选择器（单选 tab 组）
 * Segmented Control (shadcn/ui pattern)
 *
 * @module shared/ui/SegmentedControl
 * @description 药丸容器 + 白色浮起选中项的分段单选控件。
 *              收编登录/注册 tab、供应商子 tab 等手写选择器（ADR-0005 豁免类的正解）。
 *              受控组件；无新增运行时依赖（cva + cn）。
 */

import { type ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface SegmentedControlItem<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 每项等宽铺满（grid-cols-N，如登录/注册两段） */
  fullWidth?: boolean;
  /** 是否禁用整组 */
  disabled?: boolean;
  /** 容器类名 */
  className?: string;
  /** 逐项附加类名（如 font-semibold 覆盖默认字重） */
  itemClassName?: string;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  fullWidth = false,
  disabled = false,
  className,
  itemClassName,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "gap-1 rounded-xl bg-secondary-100 p-1",
        fullWidth ? "grid" : "inline-flex",
        className,
      )}
      style={fullWidth ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "cursor-pointer rounded-lg font-black transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
              active
                ? "bg-white text-secondary-900 shadow-xs"
                : "text-secondary-500 hover:text-secondary-800",
              itemClassName,
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = "SegmentedControl";
