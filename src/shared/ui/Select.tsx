/**
 * 下拉选择组件
 * Select Component
 *
 * @module shared/ui/Select
 * @description 通用下拉选择，支持 aria-label 或关联 label
 *              Generic select, supports aria-label or associated label
 */

import { type SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 是否错误状态 */
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, className = "", children, ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50 disabled:text-slate-500";

    const errorClasses = error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : "";

    return (
      <select
        ref={ref}
        className={`${baseClasses} ${errorClasses} ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";
