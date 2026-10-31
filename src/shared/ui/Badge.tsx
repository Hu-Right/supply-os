/**
 * 徽章组件
 * Badge Component (shadcn/ui pattern)
 *
 * @module shared/ui/Badge
 * @description 状态徽章，pulsate 时 role="status"。
 *              基于 shadcn/ui Badge 模式，用 cva 管理变体，cn() 合并类名。
 *              支持 shape 切换圆形药丸 / 方形标签，适配不同场景。
 *
 *              soft* 变体族（2026-10-31 徽章统一）：x-50 底 / x-200 边 / x-700 字的浅色阶，
 *              全部走设计令牌。此前 features 里 5 份手写 tone 映射（GATE_BADGE_STYLE /
 *              STATUS_TONE / BADGE_TONE / QuotesPanel / PartnerEcosystem）各抄一份裸色类，
 *              同一权益状态跨页颜色漂移——统一收口到这里。
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-secondary-100 text-secondary-700",
        success: "bg-success-100 text-success-700",
        warning: "bg-accent-100 text-accent-700",
        error: "bg-danger-100 text-danger-700",
        info: "bg-primary-100 text-primary-700",
        // ── soft 族：浅色阶 + 自带边框（shape=pill 也有描边，视觉可接受）──
        "soft-success": "bg-success-50 text-success-700 border border-success-200",
        "soft-warning": "bg-accent-50 text-accent-700 border border-accent-200",
        "soft-danger": "bg-danger-50 text-danger-700 border border-danger-200",
        "soft-info": "bg-primary-50 text-primary-700 border border-primary-200",
        "soft-neutral": "bg-secondary-50 text-secondary-600 border border-border",
        // 紫色无对应令牌（门控「升级」专用辨识色），保留裸色并注明
        "soft-special": "bg-purple-50 text-purple-700 border border-purple-200",
      },
      shape: {
        pill: "rounded-full px-2.5 py-0.5",
        tag: "rounded-md border px-2 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "pill",
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

/** 徽章变体名（含 soft 族）——tone 映射表的值类型，收编处不再自抄类串 */
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, shape, pulsate = false, children, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, shape }), pulsate && "animate-pulse", className)}
        role={pulsate ? "status" : undefined}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";
