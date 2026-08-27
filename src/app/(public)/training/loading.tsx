/**
 * /training 路由加载态
 * Route-level loading skeleton for training landing page
 */
export default function TrainingLoading() {
  return (
    <div className="space-y-12 animate-pulse">
      {/* Hero 区域骨架 */}
      <div className="relative h-[420px] rounded-2xl bg-gradient-to-br from-[#0A2A55] to-[#014058]" />
      {/* 讲师区域骨架 */}
      <div className="space-y-6">
        <div className="h-8 w-48 mx-auto rounded bg-slate-100" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-80 rounded-xl bg-white border border-slate-100 p-6 space-y-4">
              <div className="w-40 h-52 mx-auto rounded-full bg-slate-100" />
              <div className="h-5 w-24 mx-auto rounded bg-slate-100" />
              <div className="h-4 w-32 mx-auto rounded bg-slate-50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
