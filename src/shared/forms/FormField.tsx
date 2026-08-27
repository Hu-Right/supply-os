/**
 * 表单字段包装组件
 * Form Field Component (shadcn/ui pattern)
 *
 * @module shared/forms/FormField
 * @description label + children 包装，使用 cn() 合并类名。
 *              未来可与 react-hook-form + shadcn Form 集成。
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/utils";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** 字段标签 */
  label: string;
  /** 是否必填 */
  required?: boolean;
  /** 错误信息 */
  error?: string;
  /** 子元素（输入控件） */
  children: ReactNode;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, required = false, error, children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("space-y-1", className)} {...props}>
        <label className="block text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="ms-0.5 text-rose-500">*</span>}
        </label>
        {children}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  },
);

FormField.displayName = "FormField";
