"use client";

/**
 * 采购列表页 — 搜索/筛选面板区块（自 ProcurementPage.tsx 拆出，JSX 逐字不变）。
 * 容器保留 expanded 等状态，本组件负责：新旧搜索面板切换、品目五级下拉、操作按钮行。
 *
 * @module features/procurement/components/procurement-page/SearchFilterSection
 */
import { ChevronDown, Crown, Search, Target } from "lucide-react";
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
  markManualCategoryPick,
  commodityExpanded,
  onToggleExpanded,
  advancedSearchEntitled,
  keywordLibEntitled,
  hasIndustryPrefs,
  prefsMode,
  onTogglePrefs,
}: {
  search: SearchState;
  commodity: CommodityCascadeState;
  markManualCategoryPick: () => void;
  commodityExpanded: boolean;
  onToggleExpanded: () => void;
  advancedSearchEntitled: boolean;
  keywordLibEntitled: boolean;
  hasIndustryPrefs: boolean;
  prefsMode: string;
  onTogglePrefs: () => void;
}) {
  const { t } = useLocale();
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
            原本上方还有一行 32 大类 chip，与这里的第一级完全重叠，已下线。 */}
        <div className="border-t border-slate-100 pt-4">
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
                // 手动改选即作废在飞的偏好探测，并退回全量检索（匹配模式的结果不是用户选的这一层筛出来的）
                markManualCategoryPick();
                search.actions.setCommodityLevel(level, key);
              }}
            />
          </div>
        </div>

        {/* 操作按钮行：搜索 / 清除筛选 / 只看精选 —— 移至卡片底部 */}
        <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center gap-2">
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
          {/* 品目匹配按钮：账号已设置默认品目大类时始终显示，根据当前模式切换文案和行为 */}
          {hasIndustryPrefs && prefsMode !== "loading" && (
            <ToggleButton
              variant="solid"
              pressed={prefsMode === "prefs"}
              onClick={onTogglePrefs}
              className="py-2.5"
            >
              <Target className="w-3.5 h-3.5" />
              {prefsMode === "prefs" ? t("procurement_cancelCommodityMatch") : t("procurement_restoreCommodityMatch")}
            </ToggleButton>
          )}
        </div>
      </div>
    </section>
  );
}
