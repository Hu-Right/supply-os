/**
 * /procurement 路由加载态
 * Route-level loading skeleton for procurement page
 */
export default function ProcurementLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* 搜索面板骨架 */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 space-y-4">
        <div className="h-6 w-48 rounded bg-slate-100" />
        <div className="h-10 w-full rounded-lg bg-slate-50" />
        <div className="h-8 w-32 rounded-lg bg-slate-100" />
      </div>
      {/* 列表骨架 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="h-4 w-64 rounded bg-slate-100" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-slate-100 bg-slate-50/50" />
        ))}
      </div>
    </div>
  );
}
