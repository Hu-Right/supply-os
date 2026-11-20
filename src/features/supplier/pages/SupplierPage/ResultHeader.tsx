/**
 * 结果头部 — 搜索结果统计 + 排序 + 视图切换
 * @module features/supplier/pages/SupplierPage/ResultHeader
 */
import { LayoutGrid, List } from "lucide-react";
import { Select, Skeleton } from "@/shared/ui";
import { SORT_OPTIONS } from "./constants";

interface ResultHeaderProps {
  total: number;
  sortBy: string;
  setSortBy: (v: string) => void;
  viewMode: "card" | "list";
  setViewMode: (v: "card" | "list") => void;
  /** 列表首次取数中：统计文案用骨架，避免显示「找到 0 家」 */
  loading?: boolean;
  /** i18n 翻译函数 */
  t: (key: string, params?: Record<string, string>) => string;
}

export function ResultHeader({ total, sortBy, setSortBy, viewMode, setViewMode, loading = false, t }: ResultHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      {loading ? (
        <Skeleton width={180} height={16} />
      ) : (
        <p className="text-sm font-bold text-slate-700">
          {t("supplierFound", { count: total.toLocaleString() })}
        </p>
      )}
      <div className="flex items-center gap-3">
        {/* 排序 */}
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 w-auto pe-8 text-xs"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </Select>
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
