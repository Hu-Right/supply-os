/**
 * 页面横幅
 * Page Banner Component
 *
 * @module shared/layout/PageBanner
 * @description 页面顶部横幅（标题 + 操作按钮）
 *              Page top banner (title + action buttons)
 */

import { type ReactNode } from "react";

export interface PageBannerProps {
  /** 标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export function PageBanner({
  title,
  subtitle,
  actions,
  className = "",
}: PageBannerProps) {
  return (
    <div
      className={`flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 ${className}`}
    >
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

PageBanner.displayName = "PageBanner";
