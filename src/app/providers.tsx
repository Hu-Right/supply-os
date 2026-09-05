"use client";

import { Suspense, useEffect } from "react";
import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import { Toaster } from "sonner";
import { ErrorBoundaryWithI18n } from "@/shared/ui/ErrorBoundary";
import { initCountryNames } from "@/shared/data/countryNames";
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
          <AuthProvider>{children}<Toaster richColors position="top-center" closeButton duration={typeof window !== "undefined" && window.innerWidth < 768 ? 6000 : 4000} toastOptions={{ className: "max-w-[90vw] md:max-w-md" }} /></AuthProvider>
        </ErrorBoundaryWithI18n>
      </LocaleProvider>
    </Suspense>
  );
}

/** 应用启动时一次性加载运行时数据（国家名映射等） */
function AppInit() {
  useEffect(() => { initCountryNames(); }, []);
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
