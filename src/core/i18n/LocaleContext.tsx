/**
 * 多语言上下文 — Cookie 为主存储（Next.js App Router）
 *
 * @module core/i18n/LocaleContext
 * @description Cookie (`supply_os_locale`) 作为语言偏好的唯一真实源。
 *              SSR layout → middleware → x-locale header → getServerI18n()
 *              客户端 hydration 通过 initialLocale prop 传入服务端解析的语言。
 */
import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, type ReactNode } from "react";
import * as i18nModule from "i18next";
const i18n = (i18nModule as any).default || i18nModule;
import { initReactI18next, useTranslation } from "react-i18next";
import { SUPPORTED_LOCALE_CODES, getLocaleDir } from "./locales";
import { loadLanguage } from "./loader";
import type { Locale } from "./types";

const COOKIE_NAME = "supply_os_locale";
const STORAGE_KEY = "supply_os_locale";

// ---- 工具函数：读写 cookie ----
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match?.[1];
}
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function detectLocale(): Locale {
    // ★ Cookie 是唯一真实源 ★
    if (typeof document !== "undefined") {
        const stored = getCookie(COOKIE_NAME);
        if (stored && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(stored)) {
            return stored as Locale;
        }
    }
    // fallback: navigator.languages
    if (typeof navigator !== "undefined") {
        const preferred = (navigator.languages && navigator.languages.length > 0)
            ? navigator.languages
            : (navigator.language ? [navigator.language] : []);
        for (const pref of preferred) {
            const lang = pref.toLowerCase();
            const matched = SUPPORTED_LOCALE_CODES.find((code) => lang.startsWith(code));
            if (matched) return matched;
        }
    }
    return "en";
}

export function setupI18nSync(initialLocale?: Locale): void {
  const locale = initialLocale || detectLocale();
  i18n.use(initReactI18next).init({
    resources: {},
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
    returnNull: false,
  });
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDir(locale);
  }
}

type LocaleContextValue = {
    locale: Locale;
    localeDir: "ltr" | "rtl";
    setLocale: (next: Locale) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
    const { t: translate, i18n: instance } = useTranslation();
    const [ready, setReady] = useState(false);
    // Vite SPA 模式未传 initialLocale 时，自动检测（cookie / navigator）
    const effectiveLocale = initialLocale || detectLocale();

    // 初始化 i18n engine + 预加载初始语言包
    useEffect(() => {
      setupI18nSync(effectiveLocale);
      const load = async () => {
        try {
          const langsToLoad: Locale[] = [effectiveLocale];
          if (effectiveLocale !== "en") langsToLoad.push("en");
          for (const lang of langsToLoad) {
            const data = await loadLanguage(lang);
            if (Object.keys(data).length > 0) {
              i18n.addResourceBundle(lang, "translation", data, true, true);
            }
          }
          instance.changeLanguage(instance.language);
        } catch { /* ignore hydration error */ }
        setReady(true);
      };
      load();
    }, [instance, effectiveLocale]);

    const locale = (instance.language as Locale) || effectiveLocale;
    const localeDir = getLocaleDir(locale);

    const setLocale = useCallback(async (next: Locale) => {
        // 按需下载目标语言资源
        try {
          const data = await loadLanguage(next);
          if (Object.keys(data).length > 0) {
            i18n.addResourceBundle(next, "translation", data, true, true);
          }
        } catch { /* chunk not ready yet, will load on next render cycle */ }
        // 确保英文兜底已加载
        if (next !== "en") {
          try {
            const enData = await loadLanguage("en");
            if (Object.keys(enData).length > 0) {
              i18n.addResourceBundle("en", "translation", enData, true, true);
            }
          } catch { /* ignore */ }
        }
        instance.changeLanguage(next);
        // ★ Cookie 是唯一真实源 ★
        setCookie(COOKIE_NAME, next, 365);
        try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
        if (typeof document !== "undefined") {
            document.documentElement.lang = next;
            document.documentElement.dir = getLocaleDir(next);
        }
    }, [instance]);

    const t = useCallback(
        (key: string, params?: Record<string, string | number>): string =>
            translate(key, params) as string,
        [translate],
    );

    const value = useMemo(() => ({ locale, localeDir, setLocale, t }), [locale, localeDir, setLocale, t]);

    if (!ready) return null;

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
    return ctx;
}

// ---- 向后兼容 ----
export async function loadInitialLanguages(): Promise<void> {
  const lang = (i18n.language as Locale) || "en";
  const langs = lang === "en" ? ["en"] : [lang, "en"];
  await Promise.all(langs.map(async (l) => {
    const data = await loadLanguage(l as Locale);
    if (Object.keys(data).length > 0) i18n.addResourceBundle(l, "translation", data, true, true);
  }));
}

/** @deprecated 使用 setupI18nSync() + loadInitialLanguages() */
export async function initI18n(): Promise<void> {
  setupI18nSync();
  await loadInitialLanguages();
}
