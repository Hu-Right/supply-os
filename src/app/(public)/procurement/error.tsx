"use client";

/**
 * /procurement 路由错误态
 * Route-level error boundary for procurement page
 */
export default function ProcurementError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
        <span className="text-xl text-rose-500">!</span>
      </div>
      <h2 className="text-lg font-bold text-slate-900">公告加载失败</h2>
      <p className="text-sm text-slate-500 max-w-sm">
        采购公告搜索服务暂时不可用，请稍后重试。
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
