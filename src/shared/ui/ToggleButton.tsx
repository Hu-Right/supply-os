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
  /** outline（默认，未选为中性灰）/ solid（teal 实底激活态，未选为 teal 淡底——行业匹配类常开开关） */
  variant?: "outline" | "solid";
}

const activeByTone = {
  amber: "border-accent-300 bg-accent-50 text-accent-700 shadow-sm ring-1 ring-accent-200",
  teal: "border-primary-300 bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200",
} as const;

const hoverByTone = {
  amber: "hover:border-accent-300 hover:text-accent-600",
  teal: "hover:border-primary-300 hover:text-primary-600",
} as const;

/** solid 变体：激活 = teal 实底白字；未激活 = teal 淡底（整钮始终带品牌色） */
const solidActive =
  "border-primary-500 bg-primary-500 text-white hover:border-primary-600 hover:bg-primary-600";
const solidInactive =
  "border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-300 hover:text-primary-800";

export function ToggleButton({
  pressed,
  tone = "amber",
  variant = "outline",
  children,
  className,
  type = "button",
  ...props
}: ToggleButtonProps) {
  const activeCls =
    variant === "solid" ? solidActive : activeByTone[tone];
  const inactiveCls =
    variant === "solid"
      ? solidInactive
      : cn("border-secondary-200 bg-secondary-50 text-secondary-500", hoverByTone[tone]);

  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-black",
        "whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        pressed ? activeCls : inactiveCls,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

ToggleButton.displayName = "ToggleButton";
