"use client";

import { Suspense } from "react";
import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import { Toaster } from "sonner";
import type { Locale } from "@/core/i18n/bundles";

/**
 * Client-side Providers wrapper.
 * Receives initialLocale from Root Layout (SSR), passes it to LocaleProvider
 * so that translation is ready at hydration time.
 *
 * <Suspense> 作为安全边界：即使 i18next 内部触发 Suspense（如 useSuspense 配置遗漏），
 * 也不会导致整棵组件树崩溃。
 */
export default function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  return (
    <Suspense fallback={null}>
      <LocaleProvider initialLocale={initialLocale}>
        <AuthProvider>{children}<Toaster richColors position="top-center" closeButton /></AuthProvider>
      </LocaleProvider>
    </Suspense>
  );
}
