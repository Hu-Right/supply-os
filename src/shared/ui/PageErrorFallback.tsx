/**
 * 通用页面级错误降级 UI
 * Generic Page-level Error Fallback
 *
 * @module shared/ui/PageErrorFallback
 * @description 供 ErrorBoundary fallback 使用的标准页面错误降级组件。
 *              提供「刷新页面」按钮，保持各页面错误态视觉一致。
 *              2026-11 i18n 整改：标题/说明/按钮文案改走 i18n 键，
 *              此前硬编码中文导致切语言后仍是中文。
 */

import { useLocale } from "@/core/i18n";

export interface PageErrorFallbackProps {
  /** 可选的自定义标题，默认取 i18n 键 pageErrorTitle（页面加载异常） */
  title?: string;
  /** 自定义说明；不传则取 pageErrorDesc */
  description?: string;
}

/**
 * 通用页面错误降级组件
 * 用于 ErrorBoundary 的 fallback prop，展示错误提示 + 刷新按钮
 */
export function PageErrorFallback({ title, description }: PageErrorFallbackProps) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-slate-700">{title ?? t("pageErrorTitle")}</p>
        <p className="text-sm text-slate-500">{description ?? t("pageErrorDesc")}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
        >
          {t("pageErrorReload")}
        </button>
      </div>
    </div>
  );
}
