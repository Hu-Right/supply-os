/**
 * 高级搜索面板 — 7+ 维搜索（模块02 设计图还原）
 * Advanced Search Panel — Extended Search Dimensions
 *
 * @module features/procurement/components/AdvancedSearchPanel
 * @description 按「2-全球采购机会库」样图实现两行搜索布局：
 *              行1: 关键词 / UNSPSC / 国家 / 行业 / 截止时间
 *              行2: 采购机构 / 采购方式 / 预算金额 / 来源平台 + 搜索/清空按钮
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧面板切换。
 */
import { useState, useCallback, type FormEvent } from "react";
import { Search, X, Calendar, Building2, DollarSign, Globe2, Briefcase, Tag } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Input } from "@/shared/ui";
import { CountryFilter } from "@/shared/filters/CountryFilter";
import { AgencyFilter } from "@/shared/filters/AgencyFilter";
import type { NoticeSearchBarProps } from "./NoticeSearchBar";

/** 采购方式静态选项（P0 静态数据，后续接 API） */
const PROCUREMENT_METHODS = [
  { value: "", labelKey: "procurement_procurementMethodAll" as const },
  { value: "open", labelKey: "procurement_procurementMethod_open" as const },
  { value: "restricted", labelKey: "procurement_procurementMethod_restricted" as const },
  { value: "rfq", labelKey: "procurement_procurementMethod_rfQ" as const },
  { value: "direct", labelKey: "procurement_procurementMethod_direct" as const },
  { value: "framework", labelKey: "procurement_procurementMethod_framework" as const },
];

/** 热门行业静态选项（P0 静态数据，后续接 API） */
const HOT_INDUSTRIES = [
  { value: "energy", labelKey: "procurement_industry_energy" as const },
  { value: "infrastructure", labelKey: "procurement_industry_infrastructure" as const },
  { value: "medical", labelKey: "procurement_industry_medical" as const },
  { value: "transport", labelKey: "procurement_industry_transport" as const },
  { value: "it", labelKey: "procurement_industry_it" as const },
];

/** 来源平台静态选项（P0 静态数据，后续接 API） */
const SOURCE_PLATFORMS = [
  { value: "", labelKey: "procurement_sourceAll" as const },
  { value: "undp", label: "UNDP eProcurement" },
  { value: "ungm", label: "UNGM" },
  { value: "etimad", label: "Etimad" },
  { value: "gem", label: "GeM" },
  { value: "sam", label: "SAM.gov" },
  { value: "ted", label: "TED (EU)" },
  { value: "compranet", label: "Compranet" },
  { value: "nupco", label: "NUPCO" },
];

export interface AdvancedSearchPanelProps extends NoticeSearchBarProps {}

/** 高级搜索面板 — 两行 8 维搜索布局 */
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

  // ── 新增维度本地状态（P0 前端 UI，后续接 API） ──
  const [industry, setIndustry] = useState("");
  const [procurementMethod, setProcurementMethod] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");

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
    setIndustry("");
    setProcurementMethod("");
    setBudgetMin("");
    setBudgetMax("");
    setSourcePlatform("");
    clearSearch();
  }, [clearSearch]);

  return (
    <form
      id="procurement-search-form"
      onSubmit={handleFormSubmit}
      className="space-y-4"
    >
      {/* ══ 行1：关键词 / UNSPSC / 国家 / 行业 / 截止时间 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.2fr_auto_auto_1.3fr] gap-3 items-end">
        {/* 关键词 */}
        <div className="md:col-span-1">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_advancedSearch") || "关键词"}
          </label>
          <div className="relative">
            <Input
              value={form.qInput}
              onChange={(e) => form.setQInput(e.target.value)}
              placeholder={t("procurement_keywordPlaceholder") || "输入产品、项目、机构、UNSPSC关键词"}
              className="w-full ps-9"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* UNSPSC / 产品服务分类 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            UNSPSC / {t("procurement_level") || "产品服务分类"}
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
        <div className="min-w-[140px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <Globe2 className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_country") || "国家"}
          </label>
          <CountryFilter
            countries={countries}
            value={form.countryInput}
            onChange={form.setCountryInput}
            locale={useLocale().locale}
            placeholder={t("procurement_countryAll")}
            noResultsText={t("countryFilter_noResults")}
            className="w-full"
          />
        </div>

        {/* 行业 */}
        <div className="min-w-[120px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <Tag className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_industryAll") || "行业"}
          </label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="">{t("procurement_industryAll") || "选择行业"}</option>
            {HOT_INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {t(ind.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* 截止时间 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <Calendar className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_deadlineFrom") || "截止时间"}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={form.fromInput}
              onChange={(e) => form.setFromInput(e.target.value)}
              className="w-full text-sm"
              aria-label={t("procurement_deadlineStart") || "开始日期"}
            />
            <span className="text-xs text-slate-400 shrink-0">~</span>
            <Input
              type="date"
              value={form.toInput}
              onChange={(e) => form.setToInput(e.target.value)}
              className="w-full text-sm"
              aria-label={t("procurement_deadlineEnd") || "结束日期"}
            />
          </div>
        </div>
      </div>

      {/* ═══ 行2：采购机构 / 采购方式 / 预算金额 / 来源平台 + 按钮 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_auto_1fr_auto_auto] gap-3 items-end">
        {/* 采购机构/买家 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <Building2 className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_agency") || "采购机构"} / {t("procurement_buyerInfo") || "买家"}
          </label>
          <AgencyFilter
            agencies={agencies}
            value={form.agencyInput}
            onChange={form.setAgencyInput}
            placeholder={t("procurement_agencyAll")}
            noResultsText={t("agencyFilter_noResults")}
            className="w-full"
          />
        </div>

        {/* 采购方式 */}
        <div className="min-w-[130px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <Briefcase className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_procurementMethod") || "采购方式"}
          </label>
          <select
            value={procurementMethod}
            onChange={(e) => setProcurementMethod(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors appearance-none cursor-pointer"
          >
            {PROCUREMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* 预算金额 (USD) */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            <DollarSign className="w-3.5 h-3.5 inline mr-1" />
            {t("procurement_budgetRange") || "预算金额（USD）"}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              inputMode="numeric"
              value={budgetMin}
              onChange={handleBudgetMinChange}
              placeholder={t("procurement_budgetMin") || "最小值"}
              className="w-full text-sm"
            />
            <span className="text-xs text-slate-400 shrink-0">~</span>
            <Input
              type="text"
              inputMode="numeric"
              value={budgetMax}
              onChange={handleBudgetMaxChange}
              placeholder={t("procurement_budgetMax") || "最大值"}
              className="w-full text-sm"
            />
          </div>
        </div>

        {/* 来源平台 */}
        <div className="min-w-[130px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_sourcePlatform") || "来源平台"}
          </label>
          <select
            value={sourcePlatform}
            onChange={(e) => setSourcePlatform(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-colors appearance-none cursor-pointer"
          >
            {SOURCE_PLATFORMS.map((s) => (
              <option key={s.value} value={s.value}>
                {"label" in s ? s.label : t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* 搜索 + 清空按钮 */}
        <div className="flex items-end gap-2">
          <Button
            type="submit"
            variant="primary"
            className="font-black whitespace-nowrap px-6"
          >
            <Search className="w-4 h-4 mr-1" />
            {t("procurement_searchBtn")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="px-3 whitespace-nowrap text-slate-500 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            {t("procurement_clear")}
          </Button>
        </div>
      </div>
    </form>
  );
}
