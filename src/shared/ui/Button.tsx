/**
 * 按钮组件
 * Button Component (shadcn/ui pattern)
 *
 * @module shared/ui/Button
 * @description 通用按钮，支持 icon-only 模式（必填 aria-label）。
 *              基于 shadcn/ui Button 模式：cva 管理变体 + Radix Slot 支持 asChild。
 *              asChild 允许按钮渲染为 <a> 等其他元素，保留所有按钮行为。
 */

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold leading-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-600 text-white shadow-xs shadow-primary-950/10 hover:bg-primary-700 hover:shadow-sm focus-visible:ring-primary-600",
        dark:
          "bg-secondary-900 text-white shadow-xs shadow-secondary-950/15 hover:bg-secondary-800 hover:shadow-sm focus-visible:ring-secondary-600",
        secondary:
          "border border-secondary-200 bg-secondary-100 text-secondary-800 hover:border-secondary-300 hover:bg-secondary-200 focus-visible:ring-secondary-400",
        ghost:
          "bg-transparent text-secondary-600 hover:bg-secondary-100 hover:text-secondary-800 focus-visible:ring-secondary-400",
        outline:
          "border border-secondary-200 bg-white text-secondary-700 shadow-xs hover:border-secondary-300 hover:bg-secondary-50 hover:text-secondary-900 focus-visible:ring-secondary-400",
        danger:
          "bg-danger-600 text-white shadow-xs shadow-danger-950/10 hover:bg-danger-700 hover:shadow-sm focus-visible:ring-danger-600",
        // 醒目行动点（客服/升级提示等 amber 场景）
        accent:
          "bg-accent-500 text-white shadow-xs shadow-accent-950/10 hover:bg-accent-600 hover:shadow-sm focus-visible:ring-accent-500",
        // 营销转化 CTA（teal 渐变，AI 匹配/升级确认等核心转化按钮）
        cta:
          "bg-gradient-to-tr from-primary-500 to-primary-600 text-white shadow-xs shadow-primary-950/15 hover:from-primary-600 hover:to-primary-700 hover:shadow-md focus-visible:ring-primary-500",
        // 文字链按钮（shadcn link 标准形态；配合 size="sm" + className="px-0" 可做纯链接）
        link:
          "rounded-none bg-transparent px-0 text-primary-700 underline-offset-4 hover:underline hover:text-primary-800 focus-visible:ring-primary-500 active:scale-100",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        // 图标按钮（shadcn 标准方形，必须配 aria-label）
        icon: "h-10 w-10 p-0",
        iconSm: "h-8 w-8 p-0 min-h-11 min-w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** 是否加载中（显示 spinner + 禁用） */
  loading?: boolean;
  /** 子元素 */
  children?: ReactNode;
  /** 渲染为子元素（如 <a>），保留所有按钮行为 */
  asChild?: boolean;
}

export function Button({
  variant,
  size,
  loading = false,
  asChild = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </Comp>
  );
}

Button.displayName = "Button";

export { buttonVariants };
