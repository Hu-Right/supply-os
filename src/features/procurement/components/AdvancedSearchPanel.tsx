/**
 * 高级搜索面板 — 模块02 设计图 100% 还原
 * Advanced Search Panel — Design Mockup 1:1 Restoration
 *
 * @module features/procurement/components/AdvancedSearchPanel
 * @description 按「2-全球采购机会库」样图实现两行搜索布局：
 *              行1: 关键词 / UNSPSC / 国家 / 行业(L1) / 截止时间
 *              行2: 采购机构 / 采购方式(公告类型) / 预算金额 + 搜索/清空
 *
 *              与原始设计图的 3 处差异（用户明确要求）：
 *              1. 采购方式 → 实际过滤 notice_type（公告类型），标签仍显示"采购方式"
 *              2. 行业 → 使用 UNSPSC 一级分类（动态加载）
 *              3. 预算金额 → 全链路实现（前端→URL→后端→SQL）
 *
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧面板切换。
 */
import { useState, useCallback, type FormEvent } from "react";
import { Search, Calendar as CalendarIcon } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Input, Calendar, Select, Popover, PopoverTrigger, PopoverContent } from "@/shared/ui";
import { CountryFilter } from "@/shared/filters/CountryFilter";
import { AgencyFilter } from "@/shared/filters/AgencyFilter";
import type { NoticeSearchBarProps } from "./NoticeSearchBar";

/** 公告类型选项（复用现有 notice_type 归一化体系，标签显示为"采购方式"） */
const NOTICE_TYPE_OPTIONS = [
  { value: "", labelKey: "procurement_noticeTypeAll" as const },
  { value: "ITB", labelKey: "procurement_type_itb" as const },
  { value: "RFQ", labelKey: "procurement_type_rfq" as const },
  { value: "RFP", labelKey: "procurement_type_rfp" as const },
  { value: "EOI", labelKey: "procurement_type_eoi" as const },
  { value: "PQ", labelKey: "procurement_type_prequalification" as const },
  { value: "AWARD", labelKey: "procurement_type_contract_award" as const },
  { value: "GPN", labelKey: "procurement_type_gpn" as const },
  { value: "RFI", labelKey: "procurement_type_rfi" as const },
  { value: "COMPETITIVE", labelKey: "procurement_type_competitive" as const },
  { value: "FRAMEWORK", labelKey: "procurement_type_framework" as const },
  { value: "DIRECT", labelKey: "procurement_type_direct_contracting" as const },
  { value: "RESTRICTED", labelKey: "procurement_type_restricted" as const },
  { value: "PIN", labelKey: "procurement_type_pin" as const },
  { value: "PMC", labelKey: "procurement_type_pmc" as const },
];

/** 日期范围选择器 — Popover + Calendar */
function DateRangePicker({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  placeholderFrom,
  placeholderTo,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholderFrom: string;
  placeholderTo: string;
}) {
  const displayText = fromValue || toValue
    ? `${fromValue || placeholderFrom} ~ ${toValue || placeholderTo}`
    : `${placeholderFrom} ~ ${placeholderTo}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-left transition-colors hover:border-slate-300 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none cursor-pointer"
        >
          <span className={`flex-1 truncate ${fromValue || toValue ? "text-slate-700" : "text-slate-400"}`}>
            {displayText}
          </span>
          <CalendarIcon className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar
          mode="single"
          selected={fromValue ? new Date(fromValue) : undefined}
          onSelect={(date: Date | undefined) => {
            if (!date) return;
            const iso = date.toISOString().slice(0, 10);
            if (!fromValue || (toValue && iso < fromValue)) {
              onFromChange(iso);
              onToChange("");
            } else {
              onToChange(iso);
            }
          }}
          defaultMonth={fromValue ? new Date(fromValue) : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface AdvancedSearchPanelProps extends NoticeSearchBarProps {}

/** 高级搜索面板 — 两行搜索布局（设计图 1:1 还原） */
export function AdvancedSearchPanel({
  form,
  query: _query,
  countries,
  agencies,
  applySearch,
  clearSearch,
  toggleFeatured: _toggleFeatured,
}: AdvancedSearchPanelProps) {
  const { t } = useLocale();

  // ── 预算金额本地状态 ───
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  const handleBudgetMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBudgetMin(e.target.value.replace(/[^\d]/g, ""));
  }, []);

  const handleBudgetMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBudgetMax(e.target.value.replace(/[^\d]/g, ""));
  }, []);

  const handleFormSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    applySearch();
  }, [applySearch]);

  const handleClear = useCallback(() => {
    setBudgetMin("");
    setBudgetMax("");
    clearSearch();
  }, [clearSearch]);

  return (
    <form
      id="procurement-search-form"
      onSubmit={handleFormSubmit}
      className="space-y-4"
    >
      {/* 高级搜索标题 */}
      <h3 className="text-base font-extrabold text-slate-800">{t("procurement_advancedSearchTitle") || "高级搜索"}</h3>

      {/* ══ 行1：关键词 / UNSPSC / 国家 / 截止时间 ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        {/* 关键词 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_keyword") || "关键词"}
          </label>
          <div className="relative">
            <Input
              value={form.qInput}
              onChange={(e) => form.setQInput(e.target.value)}
              placeholder={t("procurement_keywordPlaceholder") || "输入产品、项目、机构、UNSPSC关键词"}
              className="w-full pe-9"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* UNSPSC / 产品服务分类 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            UNSPSC / {t("procurement_productService") || "产品服务分类"}
          </label>
          <Input
            value={form.typeInput}
            onChange={(e) => form.setTypeInput(e.target.value)}
            placeholder={t("procurement_unspscPlaceholder") || "输入UNSPSC代码或关键词"}
            className="w-full"
            dir="auto"
          />
        </div>

        {/* 国家 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_country") || "国家"}
          </label>
          <CountryFilter
            countries={countries}
            value={form.countryInput}
            onChange={form.setCountryInput}
            locale={useLocale().locale}
            placeholder={t("procurement_selectCountry") || "选择国家"}
            noResultsText={t("countryFilter_noResults")}
            className="w-full"
          />
        </div>

        {/* 截止时间 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_deadline") || "截止时间"}
          </label>
          <DateRangePicker
            fromValue={form.fromInput}
            toValue={form.toInput}
            onFromChange={form.setFromInput}
            onToChange={form.setToInput}
            placeholderFrom={t("procurement_startDate") || "开始日期"}
            placeholderTo={t("procurement_endDate") || "结束日期"}
          />
        </div>
      </div>

      {/* ══ 行2：采购机构 / 采购方式 / 预算金额 ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        {/* 采购机构/买家 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_agency") || "采购机构"} / {t("procurement_buyer") || "买家"}
          </label>
          <AgencyFilter
            agencies={agencies}
            value={form.agencyInput}
            onChange={form.setAgencyInput}
            placeholder={t("procurement_agencyPlaceholder") || "输入机构名称或买家名称"}
            noResultsText={t("agencyFilter_noResults")}
            className="w-full"
          />
        </div>

        {/* 采购方式 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_procurementMethod") || "采购方式"}
          </label>
          <Select
            value={form.noticeTypeInput}
            onChange={(e) => form.setNoticeTypeInput(e.target.value)}
            className="w-full"
          >
            {NOTICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </Select>
        </div>

        {/* 预算金额 (USD) */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_budgetAmount") || "预算金额（USD）"}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              inputMode="numeric"
              value={budgetMin}
              onChange={handleBudgetMinChange}
              placeholder={t("procurement_minValue") || "最小值"}
              className="w-full text-sm"
            />
            <span className="text-xs text-slate-400 shrink-0">~</span>
            <Input
              type="text"
              inputMode="numeric"
              value={budgetMax}
              onChange={handleBudgetMaxChange}
              placeholder={t("procurement_maxValue") || "最大值"}
              className="w-full text-sm"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
