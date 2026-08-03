/**
 * 下拉选择组件
 * Select Component
 *
 * @module shared/ui/Select
 * @description 通用下拉选择，支持 aria-label 或关联 label
 *              Generic select, supports aria-label or associated label
 */

import { type SelectHTMLAttributes, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 是否错误状态 */
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, className = "", children, ...props }, ref) => {
    // 样式与业务代码手写下拉框保持一致（更柔和的表单风格）
    const baseClasses =
      "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500";

    const errorClasses = error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : "";

    return (
      <select
        ref={ref}
        className={twMerge(baseClasses, errorClasses, className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";
