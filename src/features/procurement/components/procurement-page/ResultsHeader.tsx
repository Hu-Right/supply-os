"use client";

/**
 * 采购列表页 — 结果头部（结果数 + 已筛条件 + 排序/导出/视图切换），自 ProcurementPage.tsx 拆出，JSX 逐字不变。
 *
 * @module features/procurement/components/procurement-page/ResultsHeader
 */
import { Download, LayoutList, LayoutGrid } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import type { SearchState } from "./types";

export function ResultsHeader({
  query,
  displayTotal,
  onClearSearch,
  onSortChange,
}: {
  query: SearchState["query"];
  /** 结果数：有搜索条件时为命中总数，否则为库存活跃数（原容器内联口径） */
  displayTotal: number;
  onClearSearch: () => void;
  onSortChange: (sort: "latest" | "deadline" | "deadline_farthest") => void;
}) {
  const { t, locale } = useLocale();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-extrabold text-slate-900">
          {t("procurement_resultsCount", { count: displayTotal.toLocaleString() })}
        </span>
        {/* 已筛条件标签 */}
        {(query.activeCountry || query.activeQ) && (
          <>
            <span className="text-xs text-slate-400">{t("procurement_filteredConditions")}</span>
            {query.activeCountry && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs text-teal-700 font-medium">
                {t("procurement_country")}: {getCountryDisplayName(query.activeCountry, locale)}
              </span>
            )}
            {query.activeQ && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs text-teal-700 font-medium">
                {query.activeQ}
              </span>
            )}
            <button
              type="button"
              onClick={onClearSearch}
              className="text-xs text-slate-400 hover:text-teal-600 font-medium underline"
            >
              {t("procurement_clearAll")}
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {/* 排序下拉 */}
        <select
          value={query.activeSort}
          onChange={(e) => {
            const v = e.target.value;
            onSortChange(v === "latest" ? "latest" : v === "deadline" ? "deadline" : "deadline_farthest");
          }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 focus:border-teal-400 outline-none cursor-pointer"
        >
          <option value="latest">{t("procurement_sortByLatest")}</option>
          <option value="deadline">{t("procurement_sortByDeadline")}</option>
          <option value="deadline_farthest">{t("procurement_sortByDeadlineFarthest")}</option>
        </select>
        {/* 导出列表 */}
        <button
          type="button"
          onClick={() => alert(t("procurement_comingSoon"))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:border-teal-400 hover:text-teal-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {t("procurement_exportList")}
        </button>
        {/* 视图切换 */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button type="button" className="p-1.5 bg-teal-50 text-teal-700" aria-label="列表视图">
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="p-1.5 bg-white text-slate-400 hover:text-slate-600" aria-label="网格视图">
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
