/**
 * 公告列表骨架屏
 * Notice List Skeleton
 *
 * @module features/procurement/components/NoticeListSkeleton
 * @description 首次加载期间的结构化骨架屏，布局逐块对齐列表行真实结构，
 *              数量与实际数据项一致，视觉过渡平滑。
 *              Structured skeleton placeholder for initial load, layout mirrors
 *              real list row structure, count matches actual data items.
 */

import { NOTICE_PAGE_SIZE } from "../constants";
import { useLocale } from "@/core/i18n";

export interface NoticeListSkeletonProps {
  /** 骨架行数量，默认 NOTICE_PAGE_SIZE（10） */
  count?: number;
}

export function NoticeListSkeleton({ count = NOTICE_PAGE_SIZE }: NoticeListSkeletonProps) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("uiLoadingDots")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4 animate-pulse">
          {/* 顶栏：左侧类型标签 + 右侧截止日 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="px-2 py-1 rounded-md bg-slate-100 h-5 w-16" />
              <div className="px-2 py-1 rounded-md bg-slate-100 h-5 w-12" />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="h-3 w-10 bg-slate-100 rounded" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
          </div>

          {/* 标题区（对齐 NoticeCard 列表行：text-sm font-extrabold line-clamp-2） */}
          <div className="mt-2 space-y-1.5">
            <div className="h-4 bg-slate-200 rounded w-4/5" />
            <div className="h-4 bg-slate-100 rounded w-3/5" />
          </div>

          {/* 两栏：左侧主内容 + 右侧按钮 */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-2">
            {/* 左栏：描述 / 机构+金额 / UNSPSC */}
            <div className="min-w-0 space-y-2">
              {/* 描述 */}
              <div className="space-y-1.5">
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-3 bg-slate-100 rounded w-5/6" />
              </div>
              {/* 机构 + 金额 + 受援国 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="h-3.5 w-32 bg-slate-200 rounded" />
                <div className="h-3.5 w-20 bg-slate-100 rounded" />
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
              {/* UNSPSC 标签 */}
              <div className="flex flex-wrap gap-1.5">
                <div className="h-5 w-14 rounded bg-slate-100 border border-slate-200" />
                <div className="h-5 w-16 rounded bg-slate-100 border border-slate-200" />
                <div className="h-5 w-12 rounded bg-slate-100 border border-slate-200" />
              </div>
            </div>
            {/* 右栏：按钮 */}
            <div className="flex items-center">
              <div className="shrink-0 h-9 w-16 rounded-lg bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
