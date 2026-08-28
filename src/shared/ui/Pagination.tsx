/**
 * 通用翻页组件
 * Shared pagination component
 *
 * @module shared/ui/Pagination
 * @description 服务端分页的通用翻页条：上一页 / 页码输入 / 下一页 / 跳转。
 *              默认使用 procurement_* 翻译键（向后兼容）；非 procurement 消费方
 *              可通过 labels prop 传入自有文案，解耦 feature 命名空间。
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils";

/** 翻页条文案（不传则回退 procurement_* 翻译键） */
export interface PaginationLabels {
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
  loading,
  onPageChange,
  labels,
}: PaginationProps) {
  const { t } = useLocale();
  const [jumpInput, setJumpInput] = useState("");

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
    <div className="flex items-center justify-center gap-2 mt-5">
      <button
        type="button"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className={cn(btnClass)}
      >
        <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
        {prevLabel}
      </button>

      <input
        type="number"
        min={1}
        max={totalPages}
        value={jumpInput}
        onChange={(e) => setJumpInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleJump(); }}
        placeholder={`${page}`}
        className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-xs text-center font-bold focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none min-h-[40px]"
        aria-label={t("uiPaginationJumpTo")}
      />

      <button
        type="button"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className={cn(btnClass)}
      >
        {nextLabel}
        <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
      </button>

      <button
        type="button"
        onClick={handleJump}
        disabled={!jumpInput || loading}
        className={cn(btnClass, "px-3")}
      >
        {t("uiPaginationGo")}
      </button>
    </div>
  );
}
