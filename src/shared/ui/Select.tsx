/**
 * 下拉选择组件
 * Select Component (shadcn/ui pattern)
 *
 * @module shared/ui/Select
 * @description 通用下拉选择，支持 aria-label 或关联 label。
 *              基于 shadcn/ui Select（原生 select 样式化）模式，使用 cn() 合并类名。
 *              保持原生 <select> 渲染，不切换到 Radix Select（避免破坏 onChange 事件模型）。
 */

import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/shared/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 是否错误状态 */
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, className, children, ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2.5 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-100 disabled:text-secondary-500";

    const errorClasses = error ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20" : "";

    return (
      <select
        ref={ref}
        className={cn(baseClasses, errorClasses, className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";
