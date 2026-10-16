/**
 * 高级搜索面板 — 模块02 设计图 100% 还原
 * Advanced Search Panel — Design Mockup 1:1 Restoration
 *
 * @module features/procurement/components/AdvancedSearchPanel
 * @description 按「2-全球采购机会库」样图实现两行搜索布局：
 *              行1: 关键词 / 旧品类码 / 国家 / 行业(L1) / 截止时间
 *              行2: 采购机构 / 采购方式(公告类型) / 预算金额 + 搜索/清空
 *
 *              与原始设计图的 3 处差异（用户明确要求）：
 *              1. 采购方式 → 实际过滤 notice_type（公告类型），标签仍显示"采购方式"
 *              2. 行业 → 使用旧品类码一级分类（动态加载）
 *              3. 预算金额 → 全链路实现（前端→URL→后端→SQL）
 *
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧面板切换。
 *
 *              2026-10 组件化拆分：DateRangePicker / KeywordGroupPicker / KeywordChip
 *              与模块常量移入 ./advanced-search/*（本文件只留容器与查询编排），
 *              拆分对交互行为逐字不变；chip 的 onCycle/onRemove 改为父侧稳定回调
 *              以让子组件 memo 真实生效（详见 ./advanced-search/KeywordChip 头注）。
 */
import { useState, useCallback, useMemo, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { MAX_KEYWORD_ROWS, composeQ, hasAdvancedSyntax, type TermMode, type TermRow } from "@/shared/utils/advanced-syntax";
import { Input, Select } from "@/shared/ui";
import { CountryFilter } from "@/shared/filters/CountryFilter";
import { AgencyFilter } from "@/shared/filters/AgencyFilter";
import type { NoticeSearchBarProps } from "./NoticeSearchBar";
import { UpgradeGateModal } from "./UpgradeGateModal";
import { DateRangePicker } from "./advanced-search/DateRangePicker";
import { KeywordGroupPicker } from "./advanced-search/KeywordGroupPicker";
import { KeywordChip } from "./advanced-search/KeywordChip";
import { NOTICE_TYPE_OPTIONS, MODE_CYCLE } from "./advanced-search/constants";

export interface AdvancedSearchPanelProps extends NoticeSearchBarProps {
  /** 服务端 gates 派生：当前用户是否享有 advanced_keyword_search（排除/精确短语）。默认 true 保持旧渲染。 */
  advancedSearchEntitled?: boolean;
  /** 服务端 gates 派生：当前用户是否享有 product_keyword_lib（我的词组）。默认 true 保持旧渲染。 */
  keywordLibEntitled?: boolean;
}

/** 高级搜索面板 — 两行搜索布局（设计图 1:1 还原） */
export function AdvancedSearchPanel({
  form,
  query: _query,
  countries,
  agencies,
  applySearch,
  toggleFeatured: _toggleFeatured,
  advancedSearchEntitled = true,
  keywordLibEntitled = true,
}: AdvancedSearchPanelProps) {
  const { t } = useLocale();

  // 升级门控弹窗状态：null=关；"advanced"=高级关键词行未授权；"kwlib"=词库未授权
  const [gate, setGate] = useState<null | "advanced" | "kwlib">(null);

  // 关键词行模式切换门控：非"包含"且无 advanced_keyword_search → 弹升级框并回退（不写入状态）
  const handleRowMode = useCallback(
    (rowId: number, mode: TermMode) => {
      if (mode !== "include" && !advancedSearchEntitled) {
        setGate("advanced");
        return;
      }
      form.setRowMode(rowId, mode);
    },
    [advancedSearchEntitled, form],
  );

  // ── 关键词 chip 输入（方案 B）───
  const [draft, setDraft] = useState("");

  // 只渲染非空行：空占位行本就参与不了 composeQ（其内部跳过空串），chip 形态下直接不显示
  const chips = useMemo(() => form.termRows.filter((r) => r.term.trim() !== ""), [form.termRows]);

  /**
   * 提交草稿为「包含」chip：按中英文逗号切分（支持一次粘贴一串）、大小写不敏感去重、
   * 受 MAX_KEYWORD_ROWS 上限约束。走 replace_rows 单次 dispatch（与 pickGroup 同口径），
   * 规避「先 add_row 再拿新 id」的时序问题；空占位行在此被自然丢弃。
   */
  const commitTerms = useCallback(
    (raw: string) => {
      const parts = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return;
      const kept: TermRow[] = form.termRows.filter((r) => r.term.trim() !== "");
      for (const term of parts) {
        if (kept.length >= MAX_KEYWORD_ROWS) break;
        const lower = term.toLowerCase();
        if (kept.some((r) => r.term.trim().toLowerCase() === lower)) continue;
        const nextId = kept.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        kept.push({ id: nextId, term, mode: "include" });
      }
      form.replaceRows(kept);
    },
    [form],
  );

  // 失焦即结算：用户打完字直接点「搜索」时 blur 先于 submit 触发，草稿不会丢
  const flushDraft = useCallback(() => {
    if (draft.trim() === "") return;
    commitTerms(draft);
    setDraft("");
  }, [draft, commitTerms]);

  const modeLabels: Record<TermMode, string> = {
    include: t("procurement_kwModeInclude"),
    exclude: t("procurement_kwModeExclude"),
    phrase: t("procurement_kwModePhrase"),
  };

  // chip 模式循环/删除：父侧稳定回调（子组件按自身 row 回传），保证 KeywordChip 的 memo 有效
  const cycleChipMode = useCallback(
    (row: TermRow) => {
      handleRowMode(row.id, MODE_CYCLE[(MODE_CYCLE.indexOf(row.mode) + 1) % MODE_CYCLE.length]);
    },
    [handleRowMode],
  );
  const removeChip = useCallback((row: TermRow) => form.removeRow(row.id), [form]);
  const openKwlibGate = useCallback(() => setGate("kwlib"), []);

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
    // 主框直接手打/粘贴的高级语法（-排除 / "短语"，及含空格被 composeQ 规范成短语的 include 行）：
    // 无 advanced_keyword_search 权益 → 弹升级框并中断提交（与后端静默剥离双保险，防绕过 UI）
    if (!advancedSearchEntitled && hasAdvancedSyntax(composeQ(form.qInput, form.termRows))) {
      setGate("advanced");
      return;
    }
    applySearch();
  }, [advancedSearchEntitled, form.qInput, form.termRows, applySearch]);

  // 词组选择：整组替换为包含模式行（走 replace_rows 规避批量 dispatch 时序问题）
  // 语义：一行=一个字面单位；含空格的词经 composeQ 规范化为整词短语，与手动 include 行同口径
  //
  // 同时把匹配模式切到「任一命中」：一个词组是用户关注领域的**并列召回集**（建筑 OR 医疗 OR 学校），
  // 而不是交集条件。面板默认 all 会让多词求交集——生产实测真实词组「工程」四词单独各数百至数千条，
  // 但硬 AND 交集为 **0 条**（OR 约 8.4 千条），等于“存了词组一点就空”。
  // 用户若确实要收紧为交集，仍可手动点回「全部匹配」（零结果时会被放宽闸口兜底）。
  // 选词组本身就是一个明确的查询意图，所以直接提交，不再要求用户多点一次「搜索」。
  const pickGroup = useCallback((terms: string[]) => {
    const rows: TermRow[] = terms
      .slice(0, MAX_KEYWORD_ROWS)
      .map((term, i) => ({ id: i + 1, term, mode: "include" }));
    form.replaceRows(rows);
    form.setMatchMode("any");
    // 关键：上面两个 dispatch 是异步的，此刻 applySearch 读到的 inputs 仍是旧快照，
    // 必须把新草稿作为 overrides 显式传入，否则 URL 会丢词组且匹配模式仍是 all。
    applySearch(undefined, { termRows: rows, matchMode: "any" });
  }, [form, applySearch]);

  return (
    <form
      id="procurement-search-form"
      onSubmit={handleFormSubmit}
      className="space-y-4"
    >
      {/* 高级搜索标题 */}
      <h3 className="text-base font-extrabold text-slate-800">{t("procurement_advancedSearchTitle") || "高级搜索"}</h3>

      {/* ══ 行1：关键词 / 国家 / 截止时间 ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        {/* 关键词 */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            {t("procurement_keyword") || "关键词"}
          </label>
          <div className="relative">
            <Input
              value={form.qInput}
              onChange={(e) => form.setQInput(e.target.value)}
              placeholder={t("procurement_keywordPlaceholder") || "输入产品、项目、机构关键词"}
              className="w-full pe-9"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
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

      {/* ══ 高级关键词行：包含/排除/精确短语（advanced_keyword_search，1299+）══ */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-slate-500">
            {t("procurement_keywordRows") || "更多关键词"}
          </label>
          <div className="flex items-center gap-3">
            {/* 匹配模式切换：全部命中（AND）/ 任一命中（OR），人人可用 */}
            <button
              type="button"
              data-testid="match-mode-toggle"
              onClick={() => form.setMatchMode(form.matchMode === "all" ? "any" : "all")}
              aria-pressed={form.matchMode === "any"}
              title={form.matchMode === "all" ? t("procurement_matchAllHint") : t("procurement_matchAnyHint")}
              className={`text-xs font-bold px-2.5 py-1 rounded-md border transition-colors ${
                form.matchMode === "any"
                  ? "text-teal-800 border-teal-300 bg-teal-50 hover:bg-teal-100"
                  : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {form.matchMode === "all" ? t("procurement_matchAll") : t("procurement_matchAny")}
            </button>
            <KeywordGroupPicker onPick={pickGroup} entitled={keywordLibEntitled} onLocked={openKwlibGate} />
          </div>
        </div>
        {/* 关键词 chip 容器：一个框承载全部关键词，高度不随关键词数量线性增长 */}
        <div
          title={t("procurement_kwChipUsage")}
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-colors focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400"
        >
          {chips.map((row) => (
            <KeywordChip
              key={row.id}
              row={row}
              modeLabel={modeLabels[row.mode]}
              cycleTitle={t("procurement_kwChipUsage")}
              removeLabel={t("procurement_kwChipRemove")}
              onCycle={cycleChipMode}
              onRemove={removeChip}
            />
          ))}
          <input
            type="text"
            data-testid="kw-chip-input"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              // 逗号（中英文均可）即时切分入库
              if (/[,，]/.test(v)) { commitTerms(v); setDraft(""); }
              else { setDraft(v); }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // 阻止表单提交：否则每确认一个关键词就发起一次搜索
                e.preventDefault();
                flushDraft();
              } else if (e.key === "Backspace" && draft === "" && chips.length > 0) {
                form.removeRow(chips[chips.length - 1].id);
              }
            }}
            onBlur={flushDraft}
            placeholder={t("procurement_kwChipPlaceholder")}
            aria-label={t("procurement_kwChipPlaceholder")}
            className="flex-1 min-w-[9rem] bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
          />
          {/* 上限可见：达上限时转琥珀色提示已满，不额外占用高度 */}
          <span
            data-testid="kw-chip-count"
            className={`shrink-0 pe-0.5 text-2xs font-bold ${chips.length >= MAX_KEYWORD_ROWS ? "text-amber-600" : "text-slate-400"}`}
          >
            {chips.length}/{MAX_KEYWORD_ROWS}
          </span>
        </div>
      </div>

      {/* 升级引导弹窗：无权益触发高级行/词库时弹出（取代内嵌锁定态与后端降级横幅） */}
      <UpgradeGateModal
        open={gate !== null}
        onClose={() => setGate(null)}
        title={gate === "kwlib" ? t("procurement_upgradeGateKwLibTitle") : t("procurement_upgradeGateAdvancedTitle")}
        description={gate === "kwlib" ? t("procurement_upgradeGateKwLibDesc") : t("procurement_upgradeGateAdvancedDesc")}
        ctaLabel={t("procurement_upgradeGateViewPlans")}
      />
    </form>
  );
}
