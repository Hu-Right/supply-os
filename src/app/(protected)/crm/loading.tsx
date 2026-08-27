/**
 * /crm 路由加载态
 * Route-level loading skeleton for CRM page
 */
export default function CrmLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 统计面板骨架 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="h-4 w-16 rounded bg-slate-100" />
            <div className="h-8 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {/* 列表骨架 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="h-10 w-full rounded-lg bg-slate-50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-slate-100 bg-slate-50/50" />
        ))}
      </div>
    </div>
  );
}
