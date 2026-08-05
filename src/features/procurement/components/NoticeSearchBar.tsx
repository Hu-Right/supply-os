/**
 * 公采搜索栏组件
 * Notice Search Bar
 *
 * @module features/procurement/components/NoticeSearchBar
 * @description 搜索输入 + 机构/国家/截止/窗口/类型筛选控件 JSX。
 *              全部 props 来自 useNoticeSearch 返回值，自身无内部状态。
 *              3 行紧凑布局：关键词→日期→属性，操作按钮已移至父组件卡片底部。
 *              Search input + agency/country/deadline/window/type filter controls;
 *              all props come from useNoticeSearch, stateless.
 *              Compact 3-row layout; action buttons moved to parent card bottom.
 */
import { Search } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { CountryFilter } from "@/shared/filters/CountryFilter";
import { AgencyFilter } from "@/shared/filters/AgencyFilter";
import { Input, Select } from "@/shared/ui";
import type { UseNoticeSearchReturn } from "../hooks/useNoticeSearch";

export interface NoticeSearchBarProps {
  /** 表单草稿（来自 useNoticeSearch.form） */
  form: UseNoticeSearchReturn["form"];
  /** URL 生效条件（来自 useNoticeSearch.query） */
  query: UseNoticeSearchReturn["query"];
  countries: Array<{ country: string; count: number }>;
  agencies: Array<{ agency: string; count: number }>;
  applySearch: (sortOverride?: "deadline" | "latest" | "deadline_farthest") => void;
  clearSearch: () => void;
  toggleFeatured: () => void;
}

export function NoticeSearchBar({
  form,
  query,
  countries,
  agencies,
  applySearch,
  clearSearch,
  toggleFeatured,
}: NoticeSearchBarProps) {
  const { t, locale } = useLocale();

  return (
    <form
      id="procurement-search-form"
      onSubmit={(e) => {
        e.preventDefault();
        applySearch();
      }}
      className="space-y-3"
    >
      {/* 第 1 行：关键词搜索 + 排序 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_170px] gap-3 lg:items-end">
        <Input
          value={form.qInput}
          onChange={(e) => form.setQInput(e.target.value)}
          placeholder={t("procurement_searchPlaceholder")}
          dir="auto"
          leftIcon={<Search className="w-4 h-4" />}
        />
        <Select
          value={query.activeSort}
          onChange={(e) => {
            const v = e.target.value;
            applySearch(v === "latest" ? "latest" : v === "deadline" ? "deadline" : "deadline_farthest");
          }}
          aria-label={t("procurement_sortByDeadlineFarthest")}
        >
          <option value="deadline_farthest">{t("procurement_sortByDeadlineFarthest")}</option>
          <option value="deadline">{t("procurement_sortByDeadline")}</option>
          <option value="latest">{t("procurement_sortByLatest")}</option>
        </Select>
      </div>

      {/* 第 2 行：截止日期起止 + 截止窗口 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_180px] gap-3">
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
      </div>

      {/* 第 3 行：采购机构 + 国家 + 采购类型 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px_minmax(0,1fr)] gap-3 lg:items-end">
        <AgencyFilter
          agencies={agencies}
          value={form.agencyInput}
          onChange={form.setAgencyInput}
          placeholder={t("procurement_agencyAll")}
          noResultsText={t("agencyFilter_noResults")}
          moreResultsText={t("agencyFilter_moreResults")}
          className="w-full"
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
        <Input
          value={form.typeInput}
          onChange={(e) => form.setTypeInput(e.target.value)}
          placeholder={t("procurement_noticeTypePlaceholder")}
          aria-label={t("procurement_noticeTypePlaceholder")}
          dir="auto"
        />
      </div>
    </form>
  );
}
