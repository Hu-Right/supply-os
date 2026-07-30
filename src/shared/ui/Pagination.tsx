/**
 * 通用翻页组件
 * Shared pagination component
 *
 * @module shared/ui/Pagination
 * @description 服务端分页的通用翻页条（由 procurement 模块下沉而来）。
 *              Generic pagination bar for server-side paging (promoted from procurement).
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/core/i18n";

export interface PaginationProps {
  page: number;
  totalPages: number;
  serverPageSize: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  serverPageSize,
  total,
  loading,
  onPageChange,
}: PaginationProps) {
  const { t } = useLocale();

  return (
    <div className="flex items-center justify-between gap-3 mt-5">
      <p className="text-xs text-slate-500">
        {t("procurement_show")} {(page - 1) * serverPageSize + 1} - {Math.min(page * serverPageSize, total)}{" "}
        {t("procurement_items")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
          {t("procurement_prev")}
        </button>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
        >
          {t("procurement_next")}
          <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
