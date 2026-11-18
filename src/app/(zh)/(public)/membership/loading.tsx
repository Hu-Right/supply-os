/**
 * /membership 路由加载态
 * Route-level loading skeleton for membership page
 */
export default function MembershipLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* 会员状态面板骨架 */}
      <div className="h-32 rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="h-6 w-36 rounded bg-slate-100" />
        <div className="h-4 w-64 rounded bg-slate-50" />
      </div>
      {/* 套餐卡片骨架 */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="h-6 w-24 rounded bg-slate-100" />
            <div className="h-10 w-32 rounded bg-slate-100" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 w-full rounded bg-slate-50" />
              ))}
            </div>
            <div className="h-10 w-full rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
