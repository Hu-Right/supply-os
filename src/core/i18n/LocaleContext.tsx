/**
 * 多语言上下文 — 静态资源注入（Next.js App Router）
 *
 * @module core/i18n/LocaleContext
 * @description 通过 client-bundles.ts 静态 import 全部 6 种语言翻译资源，
 *              i18next 实例创建时即拥有完整资源，无需异步加载等待。
 *              消除 init({ resources: {} }) + 动态 import 异步链 + null 门。
 *
 *              语言切换：locale 为 React state，t 函数由 getFixedT(locale) 驱动，
 *              不依赖 react-i18next v17 的 useSyncExternalStore 事件链。
 */
import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import * as i18nextModule from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { CLIENT_RESOURCES } from "./client-bundles";
import { SUPPORTED_LOCALE_CODES, getLocaleDir } from "./locales";
import type { Locale } from "./types";

// i18next v26 ESM 类型定义不完整，运行时存在 createInstance
const { createInstance } = i18nextModule as unknown as { createInstance: () => I18nInstance };

type I18nInstance = {
  language: string;
  changeLanguage: (lng: string) => Promise<void>;
  getFixedT: (lng: string, ns?: string | string[]) => (key: string, opts?: Record<string, unknown>) => string;
  use: (plugin: unknown) => I18nInstance;
  init: (options: Record<string, unknown>) => Promise<void>;
};

const COOKIE_NAME = "supply_os_locale";
const STORAGE_KEY = "supply_os_locale";

// ---- 工具函数：读写 cookie ----
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match?.[1];
}
function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function detectLocale(): Locale {
  const stored = getCookie(COOKIE_NAME);
  if (stored && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
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

type LocaleContextValue = {
  locale: Locale;
  localeDir: "ltr" | "rtl";
  switching: boolean;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * 内部组件：locale state + t 函数管理
 * 资源已在 LocaleProvider 中通过 CLIENT_RESOURCES 静态注入，无需异步加载。
 */
function LocaleInner({ children, effectiveLocale, i18nInstance }: {
  children: ReactNode;
  effectiveLocale: Locale;
  i18nInstance: I18nInstance;
}) {
  const instance = i18nInstance;
  const [switching, setSwitching] = useState(false);
  // ★ locale 提升为 React state —— 保证 setLocale 后必定触发 re-render ★
  const [locale, setLocaleState] = useState<Locale>(effectiveLocale);

  // 同步 HTML lang/dir
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = getLocaleDir(locale);
    }
  }, [locale]);

  const localeDir = getLocaleDir(locale);

  const setLocale = useCallback((next: Locale) => {
    if (next === locale) return;
    setSwitching(true);
    // 资源已静态注入，直接切换语言
    instance.changeLanguage(next).catch((err) => {
      console.error("[i18n] changeLanguage error:", next, err);
    }).finally(() => {
      setSwitching(false);
    });
    // ★ 显式更新 React state —— 保证 re-render，不依赖 useSyncExternalStore 事件链 ★
    setLocaleState(next);
    // ★ Cookie 持久化 ★
    setCookie(COOKIE_NAME, next, 365);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = getLocaleDir(next);
    }
  }, [instance, locale]);

  // ★ t 函数由 React state (locale) 驱动，不依赖 useSyncExternalStore 事件链 ★
  const i18nT = useMemo(
    () => instance.getFixedT(locale, "translation"),
    [instance, locale],
  );
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      i18nT(key, params as Record<string, unknown>) as string,
    [i18nT],
  );

  const value = useMemo(() => ({ locale, localeDir, switching, setLocale, t }), [locale, localeDir, switching, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const effectiveLocale = initialLocale || detectLocale();
  const i18nInstanceRef = useRef<I18nInstance | null>(null);

  // ★ 创建独立 i18next 实例（仅一次），静态注入全部翻译资源 ★
  if (!i18nInstanceRef.current) {
    const instance = createInstance();
    instance.use(initReactI18next).init({
      lng: effectiveLocale,
      fallbackLng: "en",
      resources: CLIENT_RESOURCES,
      interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
      returnNull: false,
      react: { useSuspense: false },
    });
    i18nInstanceRef.current = instance;
  }

  return (
    <I18nextProvider i18n={i18nInstanceRef.current}>
      <LocaleInner effectiveLocale={effectiveLocale} i18nInstance={i18nInstanceRef.current}>{children}</LocaleInner>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
