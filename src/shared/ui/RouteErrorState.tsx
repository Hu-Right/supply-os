"use client";

/**
 * 通用路由级错误态
 * Generic Route-level Error State
 *
 * @module shared/ui/RouteErrorState
 * @description App Router 各路由 error.tsx 的统一呈现层（标题/说明 + 重试按钮）。
 *              2026-11 i18n 整改：此前 7 个 error.tsx 各自写死中文标题与说明，
 *              切语言后仍显示中文；现收敛为一个组件，文案由调用方传入 i18n 键，
 *              重试按钮文案统一取 `uiRetry`。
 */

import { useLocale } from "@/core/i18n";

export interface RouteErrorStateProps {
  /** 错误态标题的 i18n 键 */
  titleKey: string;
  /** 错误态说明的 i18n 键 */
  descKey: string;
  /** 重试回调（即 error.tsx 的 reset） */
  onReset: () => void;
}

export function RouteErrorState({ titleKey, descKey, onReset }: RouteErrorStateProps) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
        <span className="text-xl text-rose-500">!</span>
      </div>
      <h2 className="text-lg font-bold text-slate-900">{t(titleKey)}</h2>
      <p className="text-sm text-slate-500 max-w-sm">{t(descKey)}</p>
      <button
        onClick={onReset}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
      >
        {t("uiRetry")}
      </button>
    </div>
  );
}
