/**
 * 徽章组件
 * Badge Component (shadcn/ui pattern)
 *
 * @module shared/ui/Badge
 * @description 状态徽章，pulsate 时 role="status"。
 *              基于 shadcn/ui Badge 模式，用 cva 管理变体，cn() 合并类名。
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
        error: "bg-rose-100 text-rose-700",
        info: "bg-teal-100 text-teal-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof badgeVariants> {
  /** 是否脉动动画 */
  pulsate?: boolean;
  /** 子元素 */
  children: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, pulsate = false, children, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), pulsate && "animate-pulse", className)}
        role={pulsate ? "status" : undefined}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";
