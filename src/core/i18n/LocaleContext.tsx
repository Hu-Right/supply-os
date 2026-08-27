/**
 * 多语言上下文 — Cookie 为主存储（Next.js App Router）
 *
 * @module core/i18n/LocaleContext
 * @description Cookie (`supply_os_locale`) 作为语言偏好的唯一真实源。
 *              SSR layout → getServerI18n() 直接读 Cookie
 *              客户端 hydration 通过 initialLocale prop 传入服务端解析的语言。
 *
 *              i18next v26 + react-i18next 适配：
 *              使用 createInstance() 创建独立实例，通过 I18nextProvider 注入，
 *              避免依赖 i18next 的全局单例（ESM 模式下 default 导出不可用）。
 */
import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import * as i18nextModule from "i18next";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";
import { SUPPORTED_LOCALE_CODES, getLocaleDir } from "./locales";
import { loadLanguage } from "./loader";
import type { Locale } from "./types";

// i18next v26 ESM 类型定义不完整，运行时存在 createInstance
const { createInstance } = i18nextModule as unknown as { createInstance: () => I18nInstance };

type I18nInstance = {
  language: string;
  changeLanguage: (lng: string) => Promise<void>;
  addResourceBundle: (lng: string, ns: string, resources: Record<string, string>, deep?: boolean, overwrite?: boolean) => void;
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
  // ★ Cookie 是唯一真实源 ★
  const stored = getCookie(COOKIE_NAME);
  if (stored && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(stored)) {
    return stored as Locale;
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

type LocaleContextValue = {
  locale: Locale;
  localeDir: "ltr" | "rtl";
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * 内部组件：在 I18nextProvider 内部执行翻译逻辑
 * 确保 useTranslation() 在 i18next 实例初始化后被调用
 */
function LocaleInner({ children, effectiveLocale }: { children: ReactNode; effectiveLocale: Locale }) {
  const { t: translate, i18n: instance } = useTranslation();
  const [ready, setReady] = useState(false);

  // 加载翻译资源包
  useEffect(() => {
    const load = async () => {
      try {
        const langsToLoad: Locale[] = [effectiveLocale];
        if (effectiveLocale !== "en") langsToLoad.push("en");
        for (const lang of langsToLoad) {
          const data = await loadLanguage(lang);
          if (Object.keys(data).length > 0) {
            instance.addResourceBundle(lang, "translation", data, true, true);
          }
        }
        instance.changeLanguage(effectiveLocale);
      } catch { /* ignore hydration error */ }
      setReady(true);
    };
    load();
  }, [instance, effectiveLocale]);

  // 同步 HTML lang/dir
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = effectiveLocale;
      document.documentElement.dir = getLocaleDir(effectiveLocale);
    }
  }, [effectiveLocale]);

  const locale = (instance.language as Locale) || effectiveLocale;
  const localeDir = getLocaleDir(locale);

  const setLocale = useCallback(async (next: Locale) => {
    // 按需下载目标语言资源
    try {
      const data = await loadLanguage(next);
      if (Object.keys(data).length > 0) {
        instance.addResourceBundle(next, "translation", data, true, true);
      }
    } catch { /* chunk not ready yet */ }
    // 确保英文兜底已加载
    if (next !== "en") {
      try {
        const enData = await loadLanguage("en");
        if (Object.keys(enData).length > 0) {
          instance.addResourceBundle("en", "translation", enData, true, true);
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

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const effectiveLocale = initialLocale || detectLocale();
  const i18nInstanceRef = useRef<ReturnType<typeof createInstance> | null>(null);

  // ★ 创建独立 i18next 实例（仅一次）★
  if (!i18nInstanceRef.current) {
    const instance = createInstance();
    instance.use(initReactI18next).init({
      lng: effectiveLocale,
      fallbackLng: "en",
      resources: {},
      interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
      returnNull: false,
    });
    i18nInstanceRef.current = instance;
  }

  return (
    <I18nextProvider i18n={i18nInstanceRef.current}>
      <LocaleInner effectiveLocale={effectiveLocale}>{children}</LocaleInner>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
