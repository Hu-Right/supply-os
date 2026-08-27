"use client";

import { Suspense } from "react";
import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import { Toaster } from "sonner";
import type { Locale } from "@/core/i18n/bundles";

/**
 * Client-side Providers wrapper.
 * initialLocale 可选：root layout 不再传递（保持静态 ISR），
 * LocaleProvider 内部通过 detectLocale() 从 Cookie 读取语言偏好。
 *
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
    <Suspense fallback={null}>
      <LocaleProvider initialLocale={initialLocale}>
        <AuthProvider>{children}<Toaster richColors position="top-center" closeButton /></AuthProvider>
      </LocaleProvider>
    </Suspense>
  );
}
