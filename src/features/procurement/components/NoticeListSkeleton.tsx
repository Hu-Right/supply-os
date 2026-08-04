/**
 * 公告列表骨架屏
 * Notice List Skeleton
 *
 * @module features/procurement/components/NoticeListSkeleton
 * @description 首次加载/搜索期间的结构化骨架屏，替代全屏 LoadingOverlay。
 *              模拟 3 列卡片网格布局，用户感知等待时间更短。
 *              Structured skeleton placeholder shown during initial load/search,
 *              replacing the full-screen LoadingOverlay for better perceived performance.
 */

const SKELETON_CARD_COUNT = 6; // 模拟 2 行 × 3 列

export function NoticeListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading...">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3 animate-pulse">
          {/* 标题行 */}
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          {/* 副标题行 */}
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          {/* 描述区域 */}
          <div className="space-y-2 pt-1">
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-5/6" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
          {/* 底部标签行 */}
          <div className="flex gap-2 pt-2">
            <div className="h-5 bg-slate-100 rounded-full w-16" />
            <div className="h-5 bg-slate-100 rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
