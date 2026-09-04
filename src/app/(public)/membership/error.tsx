"use client";

/**
 * /membership 路由错误态
 * Route-level error boundary for membership page
 */
export default function MembershipError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // eslint-disable-next-line no-console
  console.error("[MembershipError]", error);
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
        <span className="text-xl text-rose-500">!</span>
      </div>
      <h2 className="text-lg font-bold text-slate-900">会员页面加载失败</h2>
      <p className="text-sm text-slate-500 max-w-sm">
        会员套餐数据加载时出现错误，请稍后重试。
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
      >
        重试
      </button>
    </div>
  );
}
