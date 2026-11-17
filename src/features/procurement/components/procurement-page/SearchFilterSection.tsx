"use client";

/**
 * 采购列表页 — 搜索/筛选面板区块（自 ProcurementPage.tsx 拆出，JSX 逐字不变）。
 * 容器保留 expanded 等状态，本组件负责：新旧搜索面板切换、品目五级下拉、操作按钮行。
 *
 * 移动端（<md，阶段2）：
 *   - 筛选默认折叠（关键词 + 「筛选(N)」），品目分类也收进折叠区；
 *   - 操作按钮改为吸底栏（搜索 / 筛选），安全区留白；
 *   - 桌面端布局与交互完全不变。
 *
 * @module features/procurement/components/procurement-page/SearchFilterSection
 */
import { useState } from "react";
import { ChevronDown, Crown, Search, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { flags } from "@/core/flags";
import { Button, ToggleButton } from "@/shared/ui";
import { NoticeSearchBar } from "../NoticeSearchBar";
import { AdvancedSearchPanel } from "../AdvancedSearchPanel";
import { CommodityLevelSelector } from "../CommodityLevelSelector";
import type { SearchState, CommodityCascadeState } from "./types";

export function SearchFilterSection({
  search,
  commodity,
  commodityExpanded,
  onToggleExpanded,
  advancedSearchEntitled,
  keywordLibEntitled,
}: {
  search: SearchState;
  commodity: CommodityCascadeState;
  commodityExpanded: boolean;
  onToggleExpanded: () => void;
  advancedSearchEntitled: boolean;
  keywordLibEntitled: boolean;
}) {
  const { t } = useLocale();
  // 移动端筛选展开态上提到这里：品目分类、吸底栏角标都要跟它联动
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const form = search.form;
  const activeFilterCount =
    (form.countryInput ? 1 : 0) +
    (form.fromInput || form.toInput ? 1 : 0) +
    (form.noticeTypeInput ? 1 : 0) +
    (form.termRows.some((r) => r.term.trim() !== "") ? 1 : 0);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-xs">
      <div className="p-5 space-y-4">
        {flags.ADVANCED_SEARCH ? (
          <AdvancedSearchPanel
            form={search.form}
            query={search.query}
            countries={search.result.countries}
            applySearch={search.actions.applySearch}
            clearSearch={search.actions.clearSearch}
            toggleFeatured={search.actions.toggleFeatured}
            advancedSearchEntitled={advancedSearchEntitled}
            keywordLibEntitled={keywordLibEntitled}
            mobileFiltersOpen={mobileFiltersOpen}
            onMobileFiltersToggle={() => setMobileFiltersOpen((v) => !v)}
            activeFilterCount={activeFilterCount}
          />
        ) : (
          <NoticeSearchBar
            form={search.form}
            query={search.query}
            countries={search.result.countries}
            applySearch={search.actions.applySearch}
            clearSearch={search.actions.clearSearch}
            toggleFeatured={search.actions.toggleFeatured}
          />
        )}

        {/* 品目分类五级下拉（大类 → 段 → 族 → 类 → 品目），五级同源同树。
            原本上方还有一行 32 大类 chip，与这里的第一级完全重叠，已下线。
            移动端：跟随筛选折叠（阶段2 首屏减法），展开筛选后与其它条件同屏。 */}
        <div className={`${mobileFiltersOpen ? "block" : "hidden md:block"} border-t border-slate-100 pt-4`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleExpanded}
            className="gap-2 px-0 text-sm text-slate-600 hover:text-teal-700 hover:bg-transparent"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${commodityExpanded ? "rotate-180" : ""}`} />
            {t("procurement_commodityCategory")}
          </Button>
          <div className={`overflow-hidden transition-all duration-200 ease-in-out ${commodityExpanded ? "max-h-60 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"}`}>
            <CommodityLevelSelector
              levels={commodity.levels}
              selectedKeys={commodity.selectedKeys}
              onChange={(level, key) => {
                search.actions.setCommodityLevel(level, key);
              }}
            />
          </div>

          {/* 移动端专属：只看精选 / 清除筛选（桌面端仍在下方操作行里） */}
          <div className="md:hidden mt-3 flex flex-wrap items-center gap-2">
            <ToggleButton
              pressed={search.query.activeFeatured}
              onClick={search.actions.toggleFeatured}
              tone="amber"
              className="py-2.5"
            >
              <Crown className="w-3.5 h-3.5" />
              {t("procurement_featuredOnly")}
            </ToggleButton>
            <Button type="button" variant="outline" onClick={search.actions.clearSearch} className="px-3 whitespace-nowrap">
              {t("procurement_clearSearch")}
            </Button>
          </div>
        </div>

        {/* 桌面端操作按钮行：搜索 / 清除筛选 / 只看精选 —— 移至卡片底部 */}
        <div className="hidden md:flex border-t border-slate-100 pt-4 flex-wrap items-center gap-2">
          <Button
            type="submit"
            form="procurement-search-form"
            variant="primary"
            className="font-black whitespace-nowrap"
          >
            <Search className="w-4 h-4 mr-1" />
            {t("procurement_searchBtn")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={search.actions.clearSearch}
            className="px-3 whitespace-nowrap"
          >
            {t("procurement_clearSearch")}
          </Button>
          <ToggleButton
            pressed={search.query.activeFeatured}
            onClick={search.actions.toggleFeatured}
            tone="amber"
            className="py-2.5"
          >
            <Crown className="w-3.5 h-3.5" />
            {t("procurement_featuredOnly")}
          </ToggleButton>
        </div>
      </div>

      {/* 移动端吸底操作条：滚动到任何位置都能直接搜索/开筛选；底部留出 iOS 安全区 */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 pt-2 backdrop-blur"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          type="submit"
          form="procurement-search-form"
          variant="primary"
          className="flex-1 font-black"
        >
          <Search className="w-4 h-4 mr-1" />
          {t("procurement_searchBtn")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          aria-expanded={mobileFiltersOpen}
          data-testid="mobile-filter-bar-toggle"
          className="whitespace-nowrap"
        >
          <SlidersHorizontal className="w-4 h-4 mr-1" />
          {t("procurement_advancedFilter") || "筛选"}
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-teal-600 px-1.5 py-0.5 text-2xs leading-none text-white">{activeFilterCount}</span>
          )}
        </Button>
      </div>
    </section>
  );
}