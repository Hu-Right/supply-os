/**
 * 应用顶部导航
 * App Header Component
 *
 * @module shared/layout/AppHeader
 * @description 顶部导航栏
 *              Top navigation bar
 */

import { type ReactNode } from "react";

export interface AppHeaderProps {
  /** Logo 或品牌标识 */
  brand?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export function AppHeader({ brand, actions, className = "" }: AppHeaderProps) {
  return (
    <header
      className={`sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center gap-3">{brand}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

AppHeader.displayName = "AppHeader";
