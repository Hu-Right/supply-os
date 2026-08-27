/**
 * /supplier 路由加载态
 * Route-level loading skeleton for supplier page
 */
export default function SupplierLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 搜索栏骨架 */}
      <div className="h-14 rounded-xl border border-slate-200 bg-white" />
      {/* 供应商卡片骨架 */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="h-5 w-2/5 rounded bg-slate-100" />
            <div className="h-4 w-full rounded bg-slate-50" />
            <div className="h-4 w-3/4 rounded bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
