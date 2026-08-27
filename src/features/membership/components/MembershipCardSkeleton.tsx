/**
 * 会员套餐卡片骨架屏
 * Membership Card Skeleton
 *
 * @module features/membership/components/MembershipCardSkeleton
 * @description 匹配会员套餐卡布局的骨架占位
 */
export function MembershipCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 animate-pulse space-y-4">
      {/* 套餐名 */}
      <div className="h-6 w-24 rounded bg-slate-100" />
      {/* 价格 */}
      <div className="h-10 w-32 rounded bg-slate-100" />
      {/* 权益列表 */}
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-slate-50" />
        ))}
      </div>
      {/* 操作按钮 */}
      <div className="h-10 w-full rounded-lg bg-slate-100" />
    </div>
  );
}
