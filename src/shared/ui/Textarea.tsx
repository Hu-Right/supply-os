/**
 * 多行文本域组件
 * Textarea Component (shadcn/ui pattern)
 *
 * @module shared/ui/Textarea
 * @description 通用多行文本域，样式口径与 Input 一致。
 *              基于 shadcn/ui 模式，使用 cn() 合并类名。
 */

import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/shared/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 是否错误状态 */
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className, ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2.5 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-100 disabled:text-secondary-500";

    const errorClasses = error ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20" : "";

    return (
      <textarea
        ref={ref}
        className={cn(baseClasses, errorClasses, className)}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
