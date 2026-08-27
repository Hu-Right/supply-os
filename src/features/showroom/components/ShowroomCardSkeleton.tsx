/**
 * 展厅卡片骨架屏
 * Showroom Card Skeleton
 *
 * @module features/showroom/components/ShowroomCardSkeleton
 * @description 匹配 ShowroomCard 布局的骨架占位
 */
export function ShowroomCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white animate-pulse">
      {/* Banner 占位 */}
      <div className="relative h-36 md:h-48 w-full bg-slate-100">
        <div className="absolute start-4 top-4 h-5 w-16 rounded-full bg-slate-200" />
        <div className="absolute bottom-4 left-4 right-4 space-y-1.5">
          <div className="h-5 w-3/4 rounded bg-slate-200/70" />
          <div className="h-3 w-1/2 rounded bg-slate-200/50" />
        </div>
      </div>
      {/* Content 占位 */}
      <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-full rounded bg-slate-50" />
          <div className="h-3 w-2/3 rounded bg-slate-50" />
        </div>
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="h-3 w-16 rounded bg-slate-100" />
          <div className="flex gap-1.5">
            <div className="h-6 w-16 rounded-md bg-slate-100" />
            <div className="h-6 w-20 rounded-md bg-slate-50" />
          </div>
          <div className="flex gap-2 pt-2">
            <div className="h-8 flex-1 rounded-lg bg-slate-100" />
            <div className="h-8 w-16 rounded-lg bg-slate-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
