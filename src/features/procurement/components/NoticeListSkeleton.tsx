/**
 * 公告列表骨架屏
 * Notice List Skeleton
 *
 * @module features/procurement/components/NoticeListSkeleton
 * @description 首次加载期间的结构化骨架屏，布局逐块对齐 NoticeCard 真实结构，
 *              数量与实际数据项一致，视觉过渡平滑。
 *              Structured skeleton placeholder for initial load, layout mirrors
 *              real NoticeCard structure, count matches actual data items.
 */

import { PAGE_SIZE } from "../hooks/useNoticeSearch";

export interface NoticeListSkeletonProps {
  /** 骨架卡片数量，默认 PAGE_SIZE（9） */
  count?: number;
}

export function NoticeListSkeleton({ count = PAGE_SIZE }: NoticeListSkeletonProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading...">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4 min-h-64 flex flex-col animate-pulse">
          {/* 第一行：左侧类型标签 + 右侧截止日（对齐 NoticeCard L63-83） */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="px-2 py-1 rounded-md bg-slate-100 h-5 w-16" />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="h-3 w-10 bg-slate-100 rounded" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
          </div>

          {/* 标题区（对齐 NoticeCard L97：text-base font-extrabold line-clamp-2） */}
          <div className="mt-3 space-y-1.5">
            <div className="h-4 bg-slate-200 rounded w-4/5" />
            <div className="h-4 bg-slate-100 rounded w-3/5" />
          </div>

          {/* 描述区（对齐 NoticeCard L99-101：text-xs line-clamp-3） */}
          <div className="mt-2 space-y-1.5">
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-5/6" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>

          {/* UNSPSC 标签行（对齐 NoticeCard L102-112：最多 4 个小标签） */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <div className="h-5 w-14 rounded bg-slate-100 border border-slate-200" />
            <div className="h-5 w-16 rounded bg-slate-100 border border-slate-200" />
            <div className="h-5 w-12 rounded bg-slate-100 border border-slate-200" />
            <div className="h-5 w-14 rounded bg-slate-100 border border-slate-200" />
          </div>

          {/* 底部：左侧金额+机构 / 右侧按钮（对齐 NoticeCard L113-132） */}
          <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
            <div className="text-xs min-w-0 space-y-1.5">
              <div className="h-3.5 w-20 bg-slate-200 rounded" />
              <div className="h-3 w-28 bg-slate-100 rounded" />
            </div>
            <div className="shrink-0 h-8 w-16 rounded-lg bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
