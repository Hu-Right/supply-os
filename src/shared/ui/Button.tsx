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
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-teal-600 text-white hover:bg-teal-700 focus-visible:ring-teal-600",
        dark: "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-600",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400",
        ghost: "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400",
        outline: "border border-slate-200 bg-transparent text-slate-500 hover:bg-slate-50 focus-visible:ring-slate-400",
        danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600",
        // 醒目行动点（客服/升级提示等 amber 场景）
        accent: "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500",
        // 营销转化 CTA（teal 渐变，AI 匹配/升级确认等核心转化按钮）
        cta: "bg-gradient-to-tr from-teal-500 to-teal-600 text-white hover:from-teal-600 hover:to-teal-700 focus-visible:ring-teal-500",
        // 文字链按钮（shadcn link 标准形态；配合 size="sm" + className="px-0" 可做纯链接）
        link: "bg-transparent text-teal-700 underline-offset-4 hover:underline focus-visible:ring-teal-500",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2.5 text-sm",
        lg: "px-6 py-3 text-base",
        // 图标按钮（shadcn 标准方形，必须配 aria-label）
        icon: "h-9 w-9 p-0",
        iconSm: "h-7 w-7 p-0",
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
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </Comp>
  );
}

Button.displayName = "Button";

export { buttonVariants };
