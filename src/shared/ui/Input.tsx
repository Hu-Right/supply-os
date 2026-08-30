/**
 * 输入框组件
 * Input Component (shadcn/ui pattern)
 *
 * @module shared/ui/Input
 * @description 通用输入框，支持 aria-label 或关联 label。
 *              基于 shadcn/ui Input 模式，使用 cn() 合并类名。
 */

import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "@/shared/utils";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  /** 是否错误状态 */
  error?: boolean;
  /** 左侧插槽（图标、前缀文本等） */
  prefix?: ReactNode;
  /** 右侧插槽（清除按钮、后缀文本等） */
  suffix?: ReactNode;
  /** leftIcon 的快捷方式（等价于 prefix={<Icon />}） */
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, prefix, suffix, leftIcon, className, ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2.5 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-100 disabled:text-secondary-500";

    const errorClasses = error ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20" : "";

    const effectivePrefix =
      prefix ?? (leftIcon ? <span className="pointer-events-none text-secondary-400">{leftIcon}</span> : null);

    if (effectivePrefix || suffix) {
      return (
        <div className="relative">
          {effectivePrefix && (
            <div className="absolute inset-y-0 start-0 flex items-center ps-3">{effectivePrefix}</div>
          )}
          {suffix && <div className="absolute inset-y-0 end-0 flex items-center pe-3">{suffix}</div>}
          <input
            ref={ref}
            className={cn(baseClasses, errorClasses, effectivePrefix && "ps-9", suffix && "pe-9", className)}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={cn(baseClasses, errorClasses, className)}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
