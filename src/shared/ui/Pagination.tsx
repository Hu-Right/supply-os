/**
 * 通用翻页组件
 * Shared pagination component (shadcn/ui pattern)
 *
 * @module shared/ui/Pagination
 * @description 服务端分页的通用翻页条（由 procurement 模块下沉而来）。
 *              默认使用 procurement_* 翻译键（向后兼容）；非 procurement 消费方
 *              可通过 labels prop 传入自有文案，解耦 feature 命名空间。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils";

/** 翻页条文案（不传则回退 procurement_* 翻译键） */
export interface PaginationLabels {
  /** "显示" — 显示 X-Y 的前缀 */
  show?: string;
  /** "条" — 显示 X-Y 条 的后缀 */
  items?: string;
  /** 无匹配数据提示 */
  noMatch?: string;
  /** 上一页按钮 */
  prev?: string;
  /** 下一页按钮 */
  next?: string;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  serverPageSize: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  /** 自定义文案（解耦 procurement 命名空间） */
  labels?: PaginationLabels;
}

export function Pagination({
  page,
  totalPages,
  serverPageSize,
  total,
  loading,
  onPageChange,
  labels,
}: PaginationProps) {
  const { t } = useLocale();

  const showLabel = labels?.show ?? t("procurement_show");
  const itemsLabel = labels?.items ?? t("procurement_items");
  const noMatchLabel = labels?.noMatch ?? t("procurement_noMatch");
  const prevLabel = labels?.prev ?? t("procurement_prev");
  const nextLabel = labels?.next ?? t("procurement_next");

  const btnClass =
    "inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50 min-h-[40px]";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
      <p className="text-xs text-slate-500">
        {total > 0
          ? <>{showLabel} {(page - 1) * serverPageSize + 1} - {Math.min(page * serverPageSize, total)} {itemsLabel}</>
          : <>{noMatchLabel}</>
        }
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className={cn(btnClass)}
        >
          <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
          {prevLabel}
        </button>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className={cn(btnClass)}
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
