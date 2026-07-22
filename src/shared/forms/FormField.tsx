/**
 * 表单字段包装组件
 * Form Field Component
 *
 * @module shared/forms/FormField
 * @description label + children 包装
 *              Label + children wrapper
 */

import { type ReactNode } from "react";

export interface FormFieldProps {
  /** 字段标签 */
  label: string;
  /** 是否必填 */
  required?: boolean;
  /** 错误信息 */
  error?: string;
  /** 子元素（输入控件） */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export function FormField({
  label,
  required = false,
  error,
  children,
  className = "",
}: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

FormField.displayName = "FormField";
