"use client";

/**
 * 根级错误边界兜底（架构评估 E2）
 *
 * @description providers.tsx 的自定义 ErrorBoundary 覆盖应用树内错误；
 *              本文件兜底 Next.js 渲染层抛出的错误（含 providers 自身渲染失败），
 *              按约定必须自带 <html><body>（error-global 边界不继承布局）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // eslint-disable-next-line no-console
  console.error("[GlobalError]", error);
  return (
    <html lang="zh">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
          <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
            <span className="text-xl text-rose-500">!</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">页面出现异常</h2>
          <p className="text-sm text-slate-500 max-w-sm">
            应用遇到意外错误，请刷新重试。
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
