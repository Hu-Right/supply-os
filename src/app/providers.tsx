"use client";

import { Suspense, useEffect } from "react";
import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import { Toaster } from "sonner";
import { ErrorBoundaryWithI18n } from "@/shared/ui/ErrorBoundary";
import { initCountryNames } from "@/shared/data/countryNames";
import { initPerfMonitor } from "@/core/perf";
import type { Locale } from "@/core/i18n/bundles";

/**
 * Client-side Providers wrapper.
 * initialLocale 可选：root layout 不再传递（保持静态 ISR），
 * LocaleProvider 内部通过 detectLocale() 从 Cookie 读取语言偏好。
 *
 * <ErrorBoundary> 全局兜底：捕获 React 渲染错误，ChunkLoadError 时提供重试。
 * <Suspense> 作为安全边界：即使 i18next 内部触发 Suspense，
 * 也不会导致整棵组件树崩溃。
 */
export default function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <Suspense fallback={<ProvidersSkeleton />}>
      <LocaleProvider initialLocale={initialLocale}>
        <ErrorBoundaryWithI18n>
          <AppInit />
          <AuthProvider>
            {children}
            {/* 轻提示：纯定时消失（4s），不带关闭按钮——它只是"操作已收到"的一次性反馈；
                样式统一为白底 + 细边 + 深色字，状态只由图标着色（默认 richColors 的整块品牌绿太扎眼）。 */}
            <Toaster
              position="top-center"
              duration={4000}
              toastOptions={{
                classNames: {
                  toast: "!rounded-xl !border !border-slate-200 !bg-white !text-slate-800 !shadow-lg !shadow-slate-900/5 !px-4 !py-3",
                  title: "!text-sm !font-semibold !text-slate-800",
                  description: "!text-xs !text-slate-500",
                  icon: "!me-2",
                },
              }}
            />
          </AuthProvider>
        </ErrorBoundaryWithI18n>
      </LocaleProvider>
    </Suspense>
  );
}

/** 应用启动时一次性加载运行时数据（国家名映射、Web Vitals 采集等） */
function AppInit() {
  useEffect(() => {
    initCountryNames();
    // 接上 core/perf 采集入口：不调用则 TTFB/FCP/LCP 永远不会被采集（旧注释
    // 「在 main.tsx 中调用」是 Vite 迁移遗留，本项目客户端入口就是这里）
    initPerfMonitor();
  }, []);
  return null;
}

/** Providers 加载期间的页面骨架（i18n / auth 初始化时可见） */
function ProvidersSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header 占位 */}
      <div className="h-16 animate-pulse bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100" />
          <div className="h-5 w-24 rounded bg-slate-100" />
        </div>
      </div>
      {/* Nav 占位 */}
      <div className="hidden md:block h-12 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-lg bg-slate-800" />
          ))}
        </div>
      </div>
      {/* Main 占位 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-200" />
      </div>
    </div>
  );
}
