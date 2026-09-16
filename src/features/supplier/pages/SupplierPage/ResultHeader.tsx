/**
 * 结果头部 — 搜索结果统计 + 排序 + 视图切换
 * @module features/supplier/pages/SupplierPage/ResultHeader
 */
import { LayoutGrid, List } from "lucide-react";
import { SORT_OPTIONS } from "./constants";

interface ResultHeaderProps {
  total: number;
  sortBy: string;
  setSortBy: (v: string) => void;
  viewMode: "card" | "list";
  setViewMode: (v: "card" | "list") => void;
  /** i18n 翻译函数 */
  t: (key: string, params?: Record<string, string>) => string;
}

export function ResultHeader({ total, sortBy, setSortBy, viewMode, setViewMode, t }: ResultHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm font-bold text-slate-700">
        {t("supplierFound", { count: total.toLocaleString() })}
      </p>
      <div className="flex items-center gap-3">
        {/* 排序 */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 focus:border-teal-400 outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
        {/* 视图切换 */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("card")}
            className={`p-1.5 ${viewMode === "card" ? "bg-teal-50 text-teal-700" : "bg-white text-slate-400"}`}
            aria-label={t("supplierCardView")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`p-1.5 ${viewMode === "list" ? "bg-teal-50 text-teal-700" : "bg-white text-slate-400"}`}
            aria-label={t("supplierListView")}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
