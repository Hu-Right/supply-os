/**
 * 空状态组件
 * Empty State Component
 *
 * @module shared/ui/EmptyState
 * @description 空数据占位符
 *              Empty data placeholder
 */

import { type ReactNode } from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 图标 */
  icon?: ReactNode;
  /** 操作按钮 */
  action?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export function EmptyState({
  title = "暂无数据",
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center ${className}`}
    >
      <div className="mb-3 text-slate-400">
        {icon || <Inbox className="h-12 w-12" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

EmptyState.displayName = "EmptyState";
