/**
 * 公采搜索栏组件
 * Notice Search Bar
 *
 * @module features/procurement/components/NoticeSearchBar
 * @description 搜索输入 + 国家/截止/排序/截止窗口/金额区间/采购类型筛选控件 JSX。
 *              全部 props 来自 useNoticeSearch 返回值，自身无内部状态。
 *              Search input + country/deadline/sort/window/value/type filter
 *              controls; all props come from useNoticeSearch, stateless.
 */
import { Crown, Search } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { CountryFilter } from "@/shared/filters/CountryFilter";

export interface NoticeSearchBarProps {
  qInput: string;
  setQInput: (value: string) => void;
  countryInput: string;
  setCountryInput: (value: string) => void;
  fromInput: string;
  setFromInput: (value: string) => void;
  toInput: string;
  setToInput: (value: string) => void;
  valueMinInput: string;
  setValueMinInput: (value: string) => void;
  valueMaxInput: string;
  setValueMaxInput: (value: string) => void;
  windowInput: string;
  setWindowInput: (value: string) => void;
  typeInput: string;
  setTypeInput: (value: string) => void;
  activeSort: "deadline" | "latest";
  countries: Array<{ country: string; count: number }>;
  applySearch: (sortOverride?: "deadline" | "latest") => void;
  clearSearch: () => void;
  /** T-A4：只看精选开关状态（URL 为唯一事实源）与切换动作 */
  activeFeatured: boolean;
  toggleFeatured: () => void;
}

export function NoticeSearchBar({
  qInput,
  setQInput,
  countryInput,
  setCountryInput,
  fromInput,
  setFromInput,
  toInput,
  setToInput,
  valueMinInput,
  setValueMinInput,
  valueMaxInput,
  setValueMaxInput,
  windowInput,
  setWindowInput,
  typeInput,
  setTypeInput,
  activeSort,
  countries,
  applySearch,
  clearSearch,
  activeFeatured,
  toggleFeatured,
}: NoticeSearchBarProps) {
  const { t, locale } = useLocale();

  // 公采搜索栏（本地差异 #6：G.3 + #13：T-B9 多维过滤）——服务端全库搜索
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        applySearch();
      }}
      className="space-y-3"
    >
      {/* 第一行：搜索 / 国家 / 排序 / 按钮 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px_170px_auto] gap-3 lg:items-end">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder={t("procurement_searchPlaceholder")}
          dir="auto"
          className="w-full ps-9 pe-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
      <CountryFilter
        countries={countries}
        value={countryInput}
        onChange={setCountryInput}
        locale={locale}
        placeholder={t("procurement_countryAll")}
        noResultsText={t("countryFilter_noResults")}
        moreResultsText={t("countryFilter_moreResults")}
        className="w-full"
      />
      <select
        value={activeSort}
        onChange={(e) => applySearch(e.target.value === "latest" ? "latest" : "deadline")}
        aria-label={t("procurement_sortByDeadline")}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="deadline">{t("procurement_sortByDeadline")}</option>
        <option value="latest">{t("procurement_sortByLatest")}</option>
      </select>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-black hover:bg-teal-700 whitespace-nowrap"
        >
          {t("procurement_searchBtn")}
        </button>
        <button
          type="button"
          onClick={clearSearch}
          className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 whitespace-nowrap"
        >
          {t("procurement_clearSearch")}
        </button>
      </div>
      </div>
      {/* 第二行：截止日期起止（独立一行，标签在前、输入框在后） */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap shrink-0">
            {t("procurement_deadlineFrom")}
          </span>
          <input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            title={t("procurement_deadlineFrom")}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap shrink-0">
            {t("procurement_deadlineTo")}
          </span>
          <input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            title={t("procurement_deadlineTo")}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>
      </div>
      {/* T-B9 第二行：截止窗口 / 金额区间（USD）/ 采购类型（对接 T-B8 服务端过滤） */}
      <div className="grid grid-cols-2 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)_auto] gap-3">
        <select
          value={windowInput}
          onChange={(e) => setWindowInput(e.target.value)}
          aria-label={t("procurement_deadlineWindowAny")}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">{t("procurement_deadlineWindowAny")}</option>
          <option value="7">{t("procurement_deadlineWindow7")}</option>
          <option value="30">{t("procurement_deadlineWindow30")}</option>
          <option value="90">{t("procurement_deadlineWindow90")}</option>
        </select>
        <input
          type="number"
          min={0}
          dir="ltr"
          value={valueMinInput}
          onChange={(e) => setValueMinInput(e.target.value)}
          placeholder={t("procurement_valueMinPlaceholder")}
          aria-label={t("procurement_valueMinPlaceholder")}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <input
          type="number"
          min={0}
          dir="ltr"
          value={valueMaxInput}
          onChange={(e) => setValueMaxInput(e.target.value)}
          placeholder={t("procurement_valueMaxPlaceholder")}
          aria-label={t("procurement_valueMaxPlaceholder")}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <input
          value={typeInput}
          onChange={(e) => setTypeInput(e.target.value)}
          placeholder={t("procurement_noticeTypePlaceholder")}
          aria-label={t("procurement_noticeTypePlaceholder")}
          dir="auto"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        {/* T-A4（本地差异 #14）：只看精选开关——点击即生效，不依赖搜索提交 */}
        {/* [精选功能重新启用 2026-07-31] 开关按钮恢复（原 2026-07-29 临时注释停用） */}
        <button
          type="button"
          onClick={toggleFeatured}
          aria-pressed={activeFeatured}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-black whitespace-nowrap transition-colors ${
            activeFeatured
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-500 hover:border-amber-300 hover:text-amber-600"
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          {t("procurement_featuredOnly")}
        </button>
      </div>
    </form>
  );
}
