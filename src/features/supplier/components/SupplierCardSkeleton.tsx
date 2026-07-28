/**
 * 供应商卡片骨架屏
 * Supplier Card Skeleton
 *
 * @module features/supplier/components/SupplierCardSkeleton
 * @description 列表加载期间的占位卡片，布局逐块对应 SupplierCard 的真实结构
 *              Placeholder card during list loading, mirrors the real SupplierCard layout
 */

export function SupplierCardSkeleton() {
  return (
    <div
      data-testid="supplier-skeleton"
      className="flex animate-pulse flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div>
        {/* 类型标签 + 认证状态占位 */}
        <div className="mb-3 flex items-start justify-between">
          <div className="h-4 w-16 rounded-full bg-slate-100" />
          <div className="h-4 w-14 rounded bg-slate-100" />
        </div>

        {/* 公司名占位 */}
        <div className="h-5 w-3/4 rounded bg-slate-200" />

        {/* 所在地占位 */}
        <div className="mt-3 h-3.5 w-1/2 rounded bg-slate-100" />

        {/* 主营产品 / 资质认证徽章占位 */}
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <div>
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              <div className="h-5 w-14 rounded bg-slate-100" />
              <div className="h-5 w-16 rounded bg-slate-100" />
              <div className="h-5 w-12 rounded bg-slate-100" />
            </div>
          </div>
          <div>
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              <div className="h-5 w-16 rounded border border-emerald-100 bg-emerald-50" />
              <div className="h-5 w-12 rounded border border-emerald-100 bg-emerald-50" />
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作按钮占位 */}
      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-3">
        <div className="h-7 flex-1 rounded bg-slate-100" />
        <div className="h-7 w-16 rounded bg-slate-100" />
      </div>
    </div>
  );
}

SupplierCardSkeleton.displayName = "SupplierCardSkeleton";
