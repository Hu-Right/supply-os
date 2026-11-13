"use client";

/**
 * 根级错误边界兜底（架构评估 E2）
 *
 * @description providers.tsx 的自定义 ErrorBoundary 覆盖应用树内错误；
 *              本文件兜底 Next.js 渲染层抛出的错误（含 providers 自身渲染失败），
 *              按约定必须自带 <html><body>（error-global 边界不继承布局）。
 *
 *              2026-11 i18n 整改：global-error 在 LocaleProvider **之外**渲染，
 *              用不了 useLocale（会抛「must be used within <LocaleProvider>」）。
 *              因此这里直接按 Cookie / navigator 决议语言后从 loader 取词包：
 *              zh 用首屏静态内联包，其余语言走懒加载 chunk；任何取词失败回落 zh，
 *              保证错误页永远有字可显示。
 */
import { useEffect, useState } from "react";
import { INITIAL_RESOURCES } from "@/core/i18n/client-bundles";
import { SUPPORTED_LOCALE_CODES } from "@/core/i18n/locales";
import { loadLanguage } from "@/core/i18n/loader";
import type { Locale } from "@/core/i18n/types";

const ZH_BUNDLE = INITIAL_RESOURCES.zh.translation as Record<string, string>;

/** 从 Cookie / navigator 决议语言（与 LocaleContext.detectLocale 同口径，此处独立实现以避免依赖 Provider） */
function detectLocaleStandalone(): Locale {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;)\s*supply_os_locale=([^;]*)/);
    const stored = m?.[1];
    if (stored && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  }
  if (typeof navigator !== "undefined") {
    const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const pref of preferred) {
      const lang = String(pref || "").toLowerCase();
      const matched = SUPPORTED_LOCALE_CODES.find((code) => lang.startsWith(code));
      if (matched) return matched;
    }
  }
  return "zh";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [bundle, setBundle] = useState<Record<string, string>>(ZH_BUNDLE);

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    const locale = detectLocaleStandalone();
    if (locale === "zh") return;
    void (async () => {
      try {
        const loaded = await loadLanguage(locale);
        if (cancelled) return;
        setBundle({ ...ZH_BUNDLE, ...loaded });
      } catch {
        /* 取词失败保持 zh 兜底，错误页不能因为翻译挂掉 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const t = (key: string) => bundle[key] ?? ZH_BUNDLE[key] ?? key;

  return (
    <html lang={detectLocaleStandalone()}>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
          <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
            <span className="text-xl text-rose-500">!</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">{t("errGlobalTitle")}</h2>
          <p className="text-sm text-slate-500 max-w-sm">{t("errGlobalDesc")}</p>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
          >
            {t("uiRetry")}
          </button>
        </div>
      </body>
    </html>
  );
}
