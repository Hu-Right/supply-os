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
import { Button, Input, Select } from "@/shared/ui";
import type { UseNoticeSearchReturn } from "../hooks/useNoticeSearch";

export interface NoticeSearchBarProps {
  /** 表单草稿（来自 useNoticeSearch.form） */
  form: UseNoticeSearchReturn["form"];
  /** URL 生效条件（来自 useNoticeSearch.query） */
  query: UseNoticeSearchReturn["query"];
  countries: Array<{ country: string; count: number }>;
  applySearch: (sortOverride?: "deadline" | "latest") => void;
  clearSearch: () => void;
  toggleFeatured: () => void;
}

export function NoticeSearchBar({
  form,
  query,
  countries,
  applySearch,
  clearSearch,
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
      <Input
        value={form.qInput}
        onChange={(e) => form.setQInput(e.target.value)}
        placeholder={t("procurement_searchPlaceholder")}
        dir="auto"
        leftIcon={<Search className="w-4 h-4" />}
      />
      <CountryFilter
        countries={countries}
        value={form.countryInput}
        onChange={form.setCountryInput}
        locale={locale}
        placeholder={t("procurement_countryAll")}
        noResultsText={t("countryFilter_noResults")}
        moreResultsText={t("countryFilter_moreResults")}
        className="w-full"
      />
      <Select
        value={query.activeSort}
        onChange={(e) => applySearch(e.target.value === "latest" ? "latest" : "deadline")}
        aria-label={t("procurement_sortByDeadline")}
      >
        <option value="deadline">{t("procurement_sortByDeadline")}</option>
        <option value="latest">{t("procurement_sortByLatest")}</option>
      </Select>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" className="font-black whitespace-nowrap">
          {t("procurement_searchBtn")}
        </Button>
        <Button type="button" variant="outline" onClick={clearSearch} className="px-3 whitespace-nowrap">
          {t("procurement_clearSearch")}
        </Button>
      </div>
      </div>
      {/* 第二行：截止日期起止（独立一行，标签在前、输入框在后） */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap shrink-0">
            {t("procurement_deadlineFrom")}
          </span>
          <Input
            type="date"
            value={form.fromInput}
            onChange={(e) => form.setFromInput(e.target.value)}
            title={t("procurement_deadlineFrom")}
            className="flex-1 min-w-0"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap shrink-0">
            {t("procurement_deadlineTo")}
          </span>
          <Input
            type="date"
            value={form.toInput}
            onChange={(e) => form.setToInput(e.target.value)}
            title={t("procurement_deadlineTo")}
            className="flex-1 min-w-0"
          />
        </label>
      </div>
      {/* T-B9 第二行：截止窗口 / 金额区间（USD）/ 采购类型（对接 T-B8 服务端过滤） */}
      <div className="grid grid-cols-2 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)_auto] gap-3">
        <Select
          value={form.windowInput}
          onChange={(e) => form.setWindowInput(e.target.value)}
          aria-label={t("procurement_deadlineWindowAny")}
        >
          <option value="">{t("procurement_deadlineWindowAny")}</option>
          <option value="7">{t("procurement_deadlineWindow7")}</option>
          <option value="30">{t("procurement_deadlineWindow30")}</option>
          <option value="90">{t("procurement_deadlineWindow90")}</option>
        </Select>
        <Input
          type="number"
          min={0}
          dir="ltr"
          value={form.valueMinInput}
          onChange={(e) => form.setValueMinInput(e.target.value)}
          placeholder={t("procurement_valueMinPlaceholder")}
          aria-label={t("procurement_valueMinPlaceholder")}
        />
        <Input
          type="number"
          min={0}
          dir="ltr"
          value={form.valueMaxInput}
          onChange={(e) => form.setValueMaxInput(e.target.value)}
          placeholder={t("procurement_valueMaxPlaceholder")}
          aria-label={t("procurement_valueMaxPlaceholder")}
        />
        <Input
          value={form.typeInput}
          onChange={(e) => form.setTypeInput(e.target.value)}
          placeholder={t("procurement_noticeTypePlaceholder")}
          aria-label={t("procurement_noticeTypePlaceholder")}
          dir="auto"
        />
        {/* T-A4（本地差异 #14）：只看精选开关——点击即生效，不依赖搜索提交 */}
        {/* [精选功能重新启用 2026-07-31] 开关按钮恢复（原 2026-07-29 临时注释停用） */}
        <button
          type="button"
          onClick={toggleFeatured}
          aria-pressed={query.activeFeatured}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-black whitespace-nowrap transition-colors ${
            query.activeFeatured
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
