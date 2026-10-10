/**
 * 搜索面板 — 行业主轴（门类 chip + 行业关键词）+ 产品/公司关键词
 * @module features/supplier/pages/SupplierPage/SearchPanel
 * @description 2026-10-10 重构：行业从「与国家、认证并列的一个页签」升为这一页的划分轴。
 *              上半是门类 chip（点选即按子树筛，数字与结果数同源），下半才是关键词框，
 *              语义变成「在已选行业里搜产品/公司」。
 *
 *              为什么 chip 只到门类一层：大类以下的点选路径由旁边的行业关键词框接——
 *              输「电气机械」就能落到 `UGT-I-0326` 子树，不比下拉少能力；而英文侧有 37 个
 *              大类与门类同名（ISIC 粒度比国标粗），铺成 chip 只会摆出一堆 `Manufacturing`。
 *
 *              为什么 chip 不显示零供应商的门类：facet 的 SQL 里 `HAVING suppliers > 0`
 *              已滤掉，下拉/芯片/计数/结果四处的可见口径完全同源。
 *
 *              2026-10-10 二次打磨：门类 chip 配国标 20 门类图标 + 计数徽章 + 选中态勾选，
 *              facets 未落定前出骨架 chip（不再是一个孤零零的「全部行业」）；行业区与
 *              关键词区用分隔线拉开层次；行业词框内嵌搜索图标。chip / 页签 / 排序即时生效，
 *              两个关键词框在 hook 里防抖 300ms（停手即筛，不是每个字符打一次）。
 *              骨架只看「请求是否落定」（industrySectionsLoaded），不看数组长度：
 *              拿 length===0 当 loading 会把「facet 接口挂了」或「真的没门类有挂靠」
 *              变成永久脉动的假骨架。
 */
import { Check, Factory, FlaskConical, GraduationCap, HardHat, HeartPulse, Landmark, Layers3, Leaf, Mountain, Palette, Search, Sprout, Store, Truck, UtensilsCrossed, Zap, Briefcase, Building2, Cpu, Globe2, Scale, Wrench, type LucideIcon } from "lucide-react";
import { pickLocale } from "@/core/i18n";
import { Input, Button } from "@/shared/ui";
import { SEARCH_TABS } from "./constants";
import type { IndustryFacetOption } from "../../api";

interface SearchPanelProps {
  searchTab: string;
  setSearchTab: (tab: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** 行业主轴：当前选中门类码（空串=全部行业） */
  industryCode: string;
  setIndustryCode: (v: string) => void;
  /** 行业关键词（大类/中类/小类与英文名靠它命中） */
  industryKeyword: string;
  setIndustryKeyword: (v: string) => void;
  /** 门类列表：双语名 + 子树内可见供应商数（零挂靠的不在这份列表里） */
  industrySections: IndustryFacetOption[];
  /** facet 请求已落定（成功或失败）：未落定才给骨架，落定且为空就只留「全部行业」 */
  industrySectionsLoaded: boolean;
  onSearch: () => void;
  onReset: () => void;
  /** i18n 翻译函数 */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 当前界面语言（行业名取中/英哪一侧） */
  locale: string;
}

/** GB/T 4754 门类序号（UGT-I- 后 2 位，01=A … 20=T）→ 图标；20 门类全覆盖，未知走 Factory */
const SECTION_ICONS: Record<string, LucideIcon> = {
  "01": Sprout, "02": Mountain, "03": Factory, "04": Zap, "05": HardHat,
  "06": Store, "07": Truck, "08": UtensilsCrossed, "09": Cpu, "10": Landmark,
  "11": Building2, "12": Briefcase, "13": FlaskConical, "14": Leaf, "15": Wrench,
  "16": GraduationCap, "17": HeartPulse, "18": Palette, "19": Scale, "20": Globe2,
};
const sectionIcon = (code: string): LucideIcon => SECTION_ICONS[code.slice(-2)] ?? Factory;

/** chip 公共底子：选中 teal 实底 + 白字，未选中描边；不用 disabled 态——零挂靠压根不下发 */
function chipClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
    active
      ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
      : "border border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700"
  }`;
}

/** 计数徽章：选中时用白/10 透明度，未选中时灰底 */
function countBadgeClass(active: boolean): string {
  return `ms-0.5 inline-flex min-w-5 justify-center rounded-full px-1.5 py-px text-2xs font-bold tabular-nums ${
    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
  }`;
}

/** facets 未返回前的骨架 chip：避免「孤零零一个全部行业」的半成品观感 */
function ChipSkeletonRow() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-8 rounded-full bg-slate-100 animate-pulse" style={{ width: `${88 + i * 26}px` }} />
      ))}
    </div>
  );
}

export function SearchPanel({
  searchTab, setSearchTab, searchTerm, setSearchTerm,
  industryCode, setIndustryCode, industryKeyword, setIndustryKeyword,
  industrySections, industrySectionsLoaded, onSearch, onReset, t, locale,
}: SearchPanelProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* ═══ 行业主轴 ═══ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Layers3 className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-slate-800">{t("supplierTabIndustry")}</span>
            <span className="hidden md:inline text-xs text-slate-400">{t("supplierIndustryAxisHint")}</span>
          </div>
        </div>

        {!industrySectionsLoaded ? (
          <ChipSkeletonRow />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={industryCode === ""}
              onClick={() => setIndustryCode("")}
              className={chipClass(industryCode === "")}
            >
              {industryCode === "" && <Check className="h-3.5 w-3.5" />}
              {t("supplierIndustryAll")}
            </button>
            {industrySections.map((s) => {
              const active = industryCode === s.code;
              const Icon = sectionIcon(s.code);
              return (
                <button
                  key={s.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setIndustryCode(active ? "" : s.code)}
                  className={chipClass(active)}
                  title={pickLocale(locale, s.nameEn, s.nameZh)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {pickLocale(locale, s.nameZh, s.nameEn)}
                  <span className={countBadgeClass(active)}>{s.suppliers}</span>
                </button>
              );
            })}
            {/* 行业树内搜：按名称深入大类/中类/小类子树（点 chip 只能选到门类），与门类 chip 是交集 */}
            <div className="relative ms-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                name="industryKeyword"
                value={industryKeyword}
                onChange={(e) => setIndustryKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
                placeholder={t("supplierSearchPlaceholderIndustry")}
                className="h-8 w-44 ps-8 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100" role="presentation" />

      {/* ═══ 关键词检索：只剩产品 / 公司 ═══ */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 border-b border-slate-200 pb-0 overflow-x-auto">
          <span className="text-sm font-bold text-slate-500 shrink-0">{t("supplierSearchTab")}</span>
          {SEARCH_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={searchTab === tab.key}
              onClick={() => setSearchTab(tab.key)}
              className={`pb-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
                searchTab === tab.key
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            name="supplierKeyword"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder={t("supplierSearchPlaceholder2")}
            className="w-full"
          />
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={onSearch} variant="primary" className="font-black whitespace-nowrap px-5">
              <Search className="w-4 h-4 me-1" />
              {t("supplierSearchBtn")}
            </Button>
            <Button onClick={onReset} variant="ghost" className="text-slate-500 whitespace-nowrap">
              {t("supplierResetBtn")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
