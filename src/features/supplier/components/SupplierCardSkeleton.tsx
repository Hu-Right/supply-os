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
      className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-secondary-200 bg-white"
    >
      {/* 顶部图片区 */}
      <div className="h-36 bg-secondary-100" />

      {/* 内容区 */}
      <div className="flex-1 space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-secondary-200" />
        <div className="h-3 w-1/2 rounded bg-secondary-100" />
        <div className="space-y-2 border-t border-secondary-100 pt-3">
          <div className="h-3 w-20 rounded bg-secondary-100" />
          <div className="h-3 w-40 rounded bg-secondary-100" />
          <div className="h-3 w-32 rounded bg-secondary-100" />
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="h-2.5 w-24 rounded bg-secondary-100" />
          <div className="h-1.5 w-full rounded-full bg-secondary-100" />
        </div>
      </div>

      {/* 底部操作按钮占位 */}
      <div className="flex gap-2 p-4 pt-0">
        <div className="h-8 flex-1 rounded-lg bg-secondary-100" />
        <div className="h-8 flex-1 rounded-lg bg-secondary-100" />
      </div>
    </div>
  );
}

SupplierCardSkeleton.displayName = "SupplierCardSkeleton";
