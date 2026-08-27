/**
 * /showroom 路由加载态
 * Route-level loading skeleton for showroom page
 */
export default function ShowroomLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 搜索筛选栏骨架 */}
      <div className="h-16 rounded-xl border border-slate-200 bg-white" />
      {/* 卡片网格骨架 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="h-36 md:h-48 bg-slate-100" />
            <div className="p-5 space-y-3">
              <div className="h-4 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-50" />
              <div className="h-3 w-2/3 rounded bg-slate-50" />
              <div className="flex gap-2 pt-2">
                <div className="h-8 flex-1 rounded-lg bg-slate-100" />
                <div className="h-8 w-16 rounded-lg bg-slate-50" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
