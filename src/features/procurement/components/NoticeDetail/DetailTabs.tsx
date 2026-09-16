/**
 * Tab 导航组件 — 详情页标签切换
 * @module features/procurement/components/NoticeDetail/DetailTabs
 */
import { DETAIL_TABS, TIER_BADGE_STYLE } from "./utils";

interface DetailTabsProps {
  activeTab: string;
  setActiveTab: (key: string) => void;
  /** i18n */
  t: (key: string) => string;
}

export function DetailTabs({ activeTab, setActiveTab, t }: DetailTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 mb-6">
      {DETAIL_TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${
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
