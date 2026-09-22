/**
 * Tab 导航组件 — 详情页标签切换
 * @module features/procurement/components/NoticeDetail/DetailTabs
 *
 * 交互升级（spec 2026-09-21）：吸顶（sticky top-24，低于页头 z-40）、
 * 窄屏单行横向滚动（flex-nowrap overflow-x-auto + shrink-0，替代换行堆叠）、
 * 标准 ARIA Tabs（tablist/tab + roving tabindex）与键盘导航（←/→ 循环、Home/End，
 * automatic activation：移焦点即激活，与点击语义一致）。
 */
import { useRef, type KeyboardEvent } from "react";
import { DETAIL_TABS, TIER_BADGE_STYLE, tabTriggerId, tabPanelId } from "./utils";

interface DetailTabsProps {
  activeTab: string;
  setActiveTab: (key: string) => void;
  /** i18n */
  t: (key: string) => string;
}

export function DetailTabs({ activeTab, setActiveTab, t }: DetailTabsProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  /** 循环移动焦点并激活（automatic activation） */
  const moveFocusTo = (index: number) => {
    const next = (index + DETAIL_TABS.length) % DETAIL_TABS.length;
    setActiveTab(DETAIL_TABS[next].key);
    tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = DETAIL_TABS.findIndex((tab) => tab.key === activeTab);
    if (current < 0) return;
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); moveFocusTo(current + 1); break;
      case "ArrowLeft": e.preventDefault(); moveFocusTo(current - 1); break;
      case "Home": e.preventDefault(); moveFocusTo(0); break;
      case "End": e.preventDefault(); moveFocusTo(DETAIL_TABS.length - 1); break;
      // Enter/Space：保持原生按钮激活行为，不拦截
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={t("detail_tabListAria")}
      onKeyDown={onKeyDown}
      className="sticky top-24 z-20 bg-white flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-200 pb-3 mb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {DETAIL_TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={tabTriggerId(tab.key)}
            aria-selected={isActive}
            aria-controls={tabPanelId(tab.key)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${
              isActive
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:border-teal-300 hover:text-teal-700"
            }`}
          >
            {t(tab.labelKey)}
            <span className={`px-1.5 py-0.5 rounded text-2xs font-bold border ${TIER_BADGE_STYLE[tab.tier]}`}>
              {t(tab.tierLabelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
