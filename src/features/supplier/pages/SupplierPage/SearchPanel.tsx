/**
 * 搜索面板 — 行业级联下拉（门类 → 大类 → 中类 → 小类）+ 产品/公司关键词
 * @module features/supplier/pages/SupplierPage/SearchPanel
 * @description 2026-10-12：行业筛选从「门类 chip + 行业关键词框」改成商机页那种逐级下拉。
 *              上半是四级级联（选到哪一层就按那一层的子树筛，零挂靠选项不下发），下半才是
 *              产品/公司关键词框，语义是「在已选行业里搜产品/公司」。
 *
 *              为什么换成下拉而不是 chip：门类一层铺 chip 尚可，但大类以下靠关键词框命中
 *              既不直观也猜不到词；逐级下拉让「门类→大类→中类→小类」的下钻变成纯点选，
 *              与全球商机页的品目分类交互一致，两套页面的筛选心智统一。
 *
 *              级联的选项装载、选中态推导与「清空退回上一级」都在 useIndustryCascade 里，
 *              本组件只负责渲染与把变更透出去。
 */
import { Layers3, Search } from "lucide-react";
import { Input, Button } from "@/shared/ui";
import { SEARCH_TABS } from "./constants";
import { IndustryLevelSelector } from "./IndustryLevelSelector";
import type { IndustryCascade } from "../../hooks/useIndustryCascade";

interface SearchPanelProps {
  searchTab: string;
  setSearchTab: (tab: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** 行业级联：四级选项 + 选中链 + 变更回调 + 门类落定标记 */
  industry: IndustryCascade;
  onSearch: () => void;
  onReset: () => void;
  /** i18n 翻译函数 */
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function SearchPanel({
  searchTab, setSearchTab, searchTerm, setSearchTerm,
  industry, onSearch, onReset, t,
}: SearchPanelProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* ═══ 行业主轴：四级级联下拉 ═══ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <Layers3 className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold text-slate-800">{t("supplierTabIndustry")}</span>
          <span className="hidden md:inline text-xs text-slate-400">{t("supplierIndustryAxisHint")}</span>
        </div>
        <IndustryLevelSelector
          levels={industry.levels}
          selectedKeys={industry.selectedKeys}
          onChange={industry.onChange}
          loaded={industry.loaded}
        />
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
