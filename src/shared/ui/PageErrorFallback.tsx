/**
 * 通用页面级错误降级 UI
 * Generic Page-level Error Fallback
 *
 * @module shared/ui/PageErrorFallback
 * @description 供 ErrorBoundary fallback 使用的标准页面错误降级组件。
 *              提供"刷新页面"按钮，保持各页面错误态视觉一致。
 */

export interface PageErrorFallbackProps {
  /** 可选的自定义标题，默认"页面加载异常" */
  title?: string;
}

/**
 * 通用页面错误降级组件
 * 用于 ErrorBoundary 的 fallback prop，展示错误提示 + 刷新按钮
 */
export function PageErrorFallback({ title }: PageErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-slate-700">{title ?? "页面加载异常"}</p>
        <p className="text-sm text-slate-500">请刷新页面重试</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}
