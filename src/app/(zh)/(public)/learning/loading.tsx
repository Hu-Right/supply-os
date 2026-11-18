/**
 * /learning 路由加载态
 * Route-level loading skeleton for learning page
 */
export default function LearningLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-48 mx-auto rounded bg-slate-100" />
      <div className="grid sm:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="h-5 w-3/4 rounded bg-slate-100" />
            <div className="h-4 w-full rounded bg-slate-50" />
            <div className="h-4 w-1/2 rounded bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
