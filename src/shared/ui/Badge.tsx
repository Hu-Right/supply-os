/**
 * 徽章组件
 * Badge Component
 *
 * @module shared/ui/Badge
 * @description 状态徽章，pulsate 时 role="status"
 *              Status badge, role="status" when pulsate
 */

import { type ReactNode } from "react";

export interface BadgeProps {
  /** 变体 */
  variant?: "default" | "success" | "warning" | "error" | "info";
  /** 是否脉动动画 */
  pulsate?: boolean;
  /** 子元素 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  info: "bg-teal-100 text-teal-700",
};

export function Badge({
  variant = "default",
  pulsate = false,
  children,
  className = "",
}: BadgeProps) {
  const baseClasses =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";

  const pulsateClasses = pulsate ? "animate-pulse" : "";

  return (
    <span
      className={`${baseClasses} ${variantClasses[variant]} ${pulsateClasses} ${className}`}
      role={pulsate ? "status" : undefined}
    >
      {children}
    </span>
  );
}

Badge.displayName = "Badge";
