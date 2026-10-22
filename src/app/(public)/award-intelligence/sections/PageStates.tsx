/**
 * 中标情报页 · 取数状态展示件（骨架 / 错误重试）
 * Award Intelligence · Loading & Error presentational parts
 *
 * @module app/(public)/award-intelligence/sections/PageStates
 * @description 落实 ARCHITECTURE.md 异常态要求：loading 铺骨架（不再渲染误导性「0 条记录」），
 *              error 且无真数据时给「加载失败 / 重试」而非「接入中」空态。纯展示件，样式沿用
 *              页面 slate/teal 配色与站内 animate-pulse 骨架范式。
 */

/** 覆盖度徽章骨架位（宽度错落，贴近真实文案长度） */
function BadgePulse({ w }: { w: string }) {
  return <span className={`h-6 ${w} rounded bg-white/15 animate-pulse`} />;
}

/** hero 徽章骨架行（在深色渐变 hero 内使用，bg-white/15 pulse） */
export function AwardsBadgesSkeleton() {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-2xs">
      <BadgePulse w="w-32" />
      <BadgePulse w="w-24" />
      <BadgePulse w="w-20" />
      <BadgePulse w="w-28" />
    </div>
  );
}

/** 加载骨架（内容区）：四卡 + 主内容块，全用 pulse 占位 */
export function AwardsSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 -mt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse">
            <div className="h-5 w-16 bg-slate-200 rounded" />
            <div className="h-3 w-10 bg-slate-100 rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="h-40 rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6 animate-pulse">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="h-24 w-full bg-slate-100 rounded mt-4" />
      </div>
    </div>
  );
}

/** 错误态：接口失败且无真数据时的诚实提示 + 手动重试 */
export function AwardsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 -mt-6">
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-8 text-center shadow-sm">
        <p className="text-base font-extrabold text-rose-700">中标数据加载失败</p>
        <p className="text-xs text-rose-500 mt-2">网络连接或后端服务暂时不可用，未获取到真实中标数据。请稍后重试。</p>
        <button
          onClick={onRetry}
          className="mt-4 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
