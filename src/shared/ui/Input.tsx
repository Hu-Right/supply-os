/**
 * 输入框组件
 * Input Component
 *
 * @module shared/ui/Input
 * @description 通用输入框，支持 aria-label 或关联 label
 *              Generic input, supports aria-label or associated label
 */

import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

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
  ({ error = false, prefix, suffix, leftIcon, className = "", ...props }, ref) => {
    // 样式与业务代码手写输入框保持一致（更柔和的表单风格）
    const baseClasses =
      "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500";

    const errorClasses = error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : "";

    // leftIcon 是 prefix 的快捷方式
    const effectivePrefix =
      prefix ?? (leftIcon ? <span className="pointer-events-none text-slate-400">{leftIcon}</span> : null);

    if (effectivePrefix || suffix) {
      return (
        <div className="relative">
          {effectivePrefix && (
            <div className="absolute inset-y-0 start-0 flex items-center ps-3">{effectivePrefix}</div>
          )}
          {suffix && <div className="absolute inset-y-0 end-0 flex items-center pe-3">{suffix}</div>}
          <input
            ref={ref}
            className={twMerge(baseClasses, errorClasses, effectivePrefix ? "ps-9" : "", suffix ? "pe-9" : "", className)}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={twMerge(baseClasses, errorClasses, className)}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
