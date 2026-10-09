/**
 * 搜索面板 — Tab 选择 + 筛选行
 * @module features/supplier/pages/SupplierPage/SearchPanel
 */
import { Search } from "lucide-react";
import { pickLocale } from "@/core/i18n";
import { Input, Button } from "@/shared/ui";
import { SEARCH_TABS, searchPlaceholderKey } from "./constants";
import type { IndustryFacetGroup } from "../../api";

interface SearchPanelProps {
  searchTab: string;
  setSearchTab: (tab: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** 当前选中的行业面码（空串=不筛） */
  industryCode: string;
  setIndustryCode: (v: string) => void;
  /** 行业筛选面：门类分组 + 大类子项 */
  industryGroups: IndustryFacetGroup[];
  onSearch: () => void;
  onReset: () => void;
  /** i18n 翻译函数 */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 当前界面语言（行业名取中/英哪一侧） */
  locale: string;
}

export function SearchPanel({
  searchTab, setSearchTab, searchTerm, setSearchTerm,
  industryCode, setIndustryCode, industryGroups, onSearch, onReset, t, locale,
}: SearchPanelProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Tab 选择 */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-0 overflow-x-auto">
        <span className="text-sm font-bold text-slate-500 shrink-0">{t("supplierSearchTab")}</span>
        {SEARCH_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSearchTab(tab.key)}
            className={`pb-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
              searchTab === tab.key
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* 筛选行 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_auto_auto_auto] gap-3 items-end">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t(searchPlaceholderKey(searchTab) ?? "supplierSearchPlaceholder2")}
          className="w-full"
        />
        {/* 行业筛选：数据源为权威树（门类作 optgroup，子项是大类），零挂靠节点不下发所以不会出现空选项 */}
        <select
          value={industryCode}
          onChange={(e) => setIndustryCode(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[170px] max-w-[260px]"
        >
          <option value="">{t("supplierSelectIndustry")}</option>
          {industryGroups.map((g) => {
            const gName = pickLocale(locale, g.nameZh, g.nameEn);
            return (
              <optgroup key={g.code} label={`${gName} (${g.suppliers})`}>
                <option value={g.code}>{t("supplierIndustryAllSection", { name: gName })}</option>
                {g.children.map((c) => (
                  <option key={c.code} value={c.code}>
                    {`${pickLocale(locale, c.nameZh, c.nameEn)} (${c.suppliers})`}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <div className="flex items-end gap-2">
          <Button onClick={onSearch} variant="primary" className="font-black whitespace-nowrap px-5">
            <Search className="w-4 h-4 mr-1" />
            {t("supplierSearchBtn")}
          </Button>
          <Button onClick={onReset} variant="ghost" className="text-slate-500 whitespace-nowrap">
            {t("supplierResetBtn")}
          </Button>
        </div>
      </div>
    </section>
  );
}
