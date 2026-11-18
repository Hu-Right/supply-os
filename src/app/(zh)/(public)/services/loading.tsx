/**
 * /services 路由加载态
 * Route-level loading skeleton for services page
 */
export default function ServicesLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-48 mx-auto rounded bg-slate-100" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="h-10 w-10 rounded-full bg-slate-100" />
            <div className="h-5 w-32 rounded bg-slate-100" />
            <div className="h-4 w-full rounded bg-slate-50" />
            <div className="h-4 w-2/3 rounded bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
