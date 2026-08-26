"use client";

import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import { Toaster } from "sonner";
import type { Locale } from "@/core/i18n/bundles";

/**
 * Client-side Providers wrapper.
 * Receives initialLocale from Root Layout (SSR), passes it to LocaleProvider
 * so that translation is ready at hydration time.
 */
export default function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <AuthProvider>{children}<Toaster richColors position="top-center" closeButton /></AuthProvider>
    </LocaleProvider>
  );
}
