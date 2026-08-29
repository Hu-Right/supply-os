/**
 * 二态开关按钮（开/关）
 * Toggle Button (aria-pressed)
 *
 * @module shared/ui/ToggleButton
 * @description 单按钮开关控件：精选公告、仅看差异、行业匹配、筛选展开等。
 *              pressed 时高亮（amber 醒目 / teal 品牌），未选中为中性 outline 观感。
 *              与 Button 的区别：二态是结构性语义，不作为 Button 的 variant。
 */

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface ToggleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-pressed"> {
  pressed: boolean;
  children: ReactNode;
  /** amber（默认，精选/醒目筛选）/ teal（品牌色开关） */
  tone?: "amber" | "teal";
}

const activeByTone = {
  amber: "border-amber-300 bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200",
  teal: "border-teal-300 bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200",
} as const;

const hoverByTone = {
  amber: "hover:border-amber-300 hover:text-amber-600",
  teal: "hover:border-teal-300 hover:text-teal-600",
} as const;

export function ToggleButton({
  pressed,
  tone = "amber",
  children,
  className,
  type = "button",
  ...props
}: ToggleButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-black",
        "whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? activeByTone[tone]
          : cn("border-slate-200 bg-slate-50 text-slate-500", hoverByTone[tone]),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

ToggleButton.displayName = "ToggleButton";
