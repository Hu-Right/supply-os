/**
 * 桌面 Tab 导航
 * Tab Navigation Component
 *
 * @module shared/layout/TabNav
 * @description 桌面端 Tab 导航栏
 *              Desktop tab navigation bar
 */

import { type ReactNode } from "react";

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  href?: string;
}

export interface TabNavProps {
  /** Tab 列表 */
  tabs: TabItem[];
  /** 当前激活的 Tab key */
  activeKey: string;
  /** Tab 切换回调 */
  onChange: (key: string) => void;
  /** 自定义类名 */
  className?: string;
}

export function TabNav({ tabs, activeKey, onChange, className = "" }: TabNavProps) {
  return (
    <nav
      className={`flex items-center gap-1 border-b border-slate-200 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const baseClasses =
          "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px";
        const activeClasses = isActive
          ? "border-teal-600 text-teal-600"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700";

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`${baseClasses} ${activeClasses}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

TabNav.displayName = "TabNav";
