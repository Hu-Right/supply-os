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
        default: "bg-secondary-100 text-secondary-700",
        success: "bg-success-100 text-success-700",
        warning: "bg-accent-100 text-accent-700",
        error: "bg-danger-100 text-danger-700",
        info: "bg-primary-100 text-primary-700",
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
