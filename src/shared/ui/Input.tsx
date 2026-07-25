/**
 * 输入框组件
 * Input Component
 *
 * @module shared/ui/Input
 * @description 通用输入框，支持 aria-label 或关联 label
 *              Generic input, supports aria-label or associated label
 */

import { type InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 是否错误状态 */
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = "", ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50 disabled:text-slate-500";

    const errorClasses = error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : "";

    return (
      <input
        ref={ref}
        className={`${baseClasses} ${errorClasses} ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
