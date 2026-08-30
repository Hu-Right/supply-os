/**
 * 可选中卡片（单选）
 * Selectable Card (radio-card)
 *
 * @module shared/ui/SelectableCard
 * @description 整卡可点的单选容器：注册类型卡、支付方式卡、研修班期次卡。
 *              variant: teal（站内默认）/ brand（研修班落地页红色系）。
 *              内容完全由 children 决定；三态：selected / disabled / 默认。
 */

import { type ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface SelectableCardProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** teal = border-primary-500 bg-primary-50（站内）；brand = border-red-500 bg-red-50（研修班落地页色系） */
  variant?: "teal" | "brand";
  className?: string;
}

export function SelectableCard({
  selected,
  onClick,
  children,
  disabled = false,
  variant = "teal",
  className,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "block w-full cursor-pointer rounded-xl border-2 p-4 text-start transition-all",
        "disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? variant === "brand"
            ? "border-red-500 bg-red-50"
            : "border-primary-500 bg-primary-50"
          : "border-secondary-200 bg-white hover:border-secondary-300",
        className,
      )}
    >
      {children}
    </button>
  );
}

SelectableCard.displayName = "SelectableCard";
