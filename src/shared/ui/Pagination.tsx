/**
 * 通用翻页组件（增强版）
 * Enhanced shared pagination component
 *
 * @module shared/ui/Pagination
 * @description 服务端分页的通用翻页条（由 procurement 模块下沉而来）。
 *              支持：上一页/下一页导航、当前页高亮、页码跳转输入、进度提示。
 *              默认使用 procurement_* 翻译键（向后兼容）；非 procurement 消费方
 *              可通过 labels prop 传入自有文案，解耦 feature 命名空间。
 */
import { useState } from "react";
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
  const [jumpInput, setJumpInput] = useState("");

  const showLabel = labels?.show ?? t("procurement_show");
  const itemsLabel = labels?.items ?? t("procurement_items");
  const noMatchLabel = labels?.noMatch ?? t("procurement_noMatch");
  const prevLabel = labels?.prev ?? t("procurement_prev");
  const nextLabel = labels?.next ?? t("procurement_next");

  const btnClass =
    "inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50 min-h-[40px]";

  /** 页码跳转处理：校验输入合法性后触发 onPageChange */
  const handleJump = () => {
    const target = parseInt(jumpInput, 10);
    if (!Number.isNaN(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
      setJumpInput("");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
      {/* 左侧：数据范围 + 进度提示 */}
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs text-slate-500">
          {total > 0
            ? <>{showLabel} {(page - 1) * serverPageSize + 1} - {Math.min(page * serverPageSize, total)} {itemsLabel}</>
            : <>{noMatchLabel}</>
          }
        </p>
        {total > 0 && (
          <p className="text-xs font-bold text-teal-700">
            {t("procurement_currentPage")} {page} {t("procurement_page")} / {t("procurement_eachPage")} {serverPageSize} {itemsLabel}
          </p>
        )}
      </div>

      {/* 右侧：导航按钮 + 页码跳转 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className={cn(btnClass)}
        >
          <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
          {prevLabel}
        </button>

        {/* 当前页高亮徽章 */}
        <span className="px-3 py-2 rounded-lg bg-teal-100 text-teal-800 text-xs font-black min-h-[40px] flex items-center">
          {page}
        </span>

        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className={cn(btnClass)}
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
        </button>

        {/* 页码跳转输入 */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 ml-2">
            <label htmlFor="pagination-jump" className="text-xs text-slate-500 font-bold whitespace-nowrap">
              {t("uiPaginationJumpTo")}
            </label>
            <input
              id="pagination-jump"
              type="number"
              min={1}
              max={totalPages}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJump(); }}
              placeholder={`${page}`}
              className="w-14 px-2 py-2 rounded-lg border border-slate-200 text-xs text-center font-bold focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none min-h-[40px]"
              aria-label={t("uiPaginationJumpTo")}
            />
            <button
              type="button"
              onClick={handleJump}
              disabled={!jumpInput || loading}
              className={cn(btnClass, "px-3")}
            >
              {t("uiPaginationGo")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
