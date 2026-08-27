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
import { I18nextProvider, initReactI18next } from "react-i18next";
import { SUPPORTED_LOCALE_CODES, getLocaleDir } from "./locales";
import { loadLanguage } from "./loader";
import type { Locale } from "./types";

// i18next v26 ESM 类型定义不完整，运行时存在 createInstance
const { createInstance } = i18nextModule as unknown as { createInstance: () => I18nInstance };

type I18nInstance = {
  language: string;
  changeLanguage: (lng: string) => Promise<void>;
  addResourceBundle: (lng: string, ns: string, resources: Record<string, string>, deep?: boolean, overwrite?: boolean) => void;
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
  /** 语言切换进行中（正在下载资源包 + changeLanguage） */
  switching: boolean;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * 内部组件：在 I18nextProvider 内部执行翻译逻辑
 * 确保 useTranslation() 在 i18next 实例初始化后被调用
 */
function LocaleInner({ children, effectiveLocale, initPromise, i18nInstance }: {
  children: ReactNode;
  effectiveLocale: Locale;
  initPromise: Promise<void> | null;
  i18nInstance: I18nInstance;
}) {
  const instance = i18nInstance;
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  // ★ locale 提升为 React state —— 保证 setLocale 后必定触发 re-render ★
  // 之前 locale 从 instance.language 派生，依赖 useSyncExternalStore 事件链
  // 触发重渲染。react-i18next v17 的 subscribe 每次渲染因 i18nOptions 引用变化
  // 而重建，导致 useSyncExternalStore 反复重新订阅；changeLanguage 的
  // languageChanged 事件可能在旧订阅已拆除、新订阅未生效的间隙触发，
  // 使 useSyncExternalStore 完全错过事件 → 组件树不重渲染 → 语言切换"无效果"。
  const [locale, setLocaleState] = useState<Locale>(effectiveLocale);

  // 加载翻译资源包（仅初始挂载 + effectiveLocale 变化时）
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (initPromise) await initPromise;
        const langsToLoad: Locale[] = [effectiveLocale];
        if (effectiveLocale !== "en") langsToLoad.push("en");
        for (const lang of langsToLoad) {
          const data = await loadLanguage(lang);
          if (Object.keys(data).length > 0) {
            instance.addResourceBundle(lang, "translation", data, true, true);
          }
        }
        await instance.changeLanguage(effectiveLocale);
        if (!cancelled) setLocaleState(effectiveLocale);
      } catch (err) {
        console.error("[i18n] init load error:", err);
      }
      if (!cancelled) setReady(true);
    };
    load();
    return () => { cancelled = true; };
  }, [instance, effectiveLocale, initPromise]);

  // 同步 HTML lang/dir
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = getLocaleDir(locale);
    }
  }, [locale]);

  const localeDir = getLocaleDir(locale);

  const setLocale = useCallback(async (next: Locale) => {
    if (next === locale) return;
    setSwitching(true);
    try {
      if (initPromise) await initPromise;
      // 按需下载目标语言资源
      try {
        const data = await loadLanguage(next);
        if (Object.keys(data).length > 0) {
          instance.addResourceBundle(next, "translation", data, true, true);
        }
      } catch (err) {
        console.error("[i18n] loadLanguage error:", next, err);
      }
      // 确保英文兜底已加载
      if (next !== "en") {
        try {
          const enData = await loadLanguage("en");
          if (Object.keys(enData).length > 0) {
            instance.addResourceBundle("en", "translation", enData, true, true);
          }
        } catch (err) {
          console.error("[i18n] loadLanguage(en) error:", err);
        }
      }
      // 切换 i18next 实例语言
      await instance.changeLanguage(next);
    } catch (err) {
      console.error("[i18n] changeLanguage error:", next, err);
    } finally {
      setSwitching(false);
    }
    // ★ 显式更新 React state —— 保证 re-render，不依赖 useSyncExternalStore 事件链 ★
    setLocaleState(next);
    // ★ Cookie 持久化 ★
    setCookie(COOKIE_NAME, next, 365);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = getLocaleDir(next);
    }
  }, [instance, initPromise, locale]);

  // ★ t 函数由 React state (locale) 驱动，不依赖 useSyncExternalStore 事件链 ★
  // useTranslation() 的 translate 依赖 useSyncExternalStore 检测 languageChanged 事件，
  // 但 react-i18next v17 的 subscribe 每次渲染因 i18nOptions 引用变化而重建，
  // 事件可能在订阅间隙丢失 → translate 永远返回旧语言翻译。
  // getFixedT(locale) 直接从 i18next 实例按当前 locale 生成翻译函数，100% 确定性。
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

  if (!ready) return null;

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const effectiveLocale = initialLocale || detectLocale();
  const i18nInstanceRef = useRef<ReturnType<typeof createInstance> | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // ★ 创建独立 i18next 实例（仅一次）★
  if (!i18nInstanceRef.current) {
    const instance = createInstance();
    const initPromise = instance.use(initReactI18next).init({
      lng: effectiveLocale,
      fallbackLng: "en",
      resources: {},
      interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
      returnNull: false,
      // ★ react-i18next v17 默认 useSuspense: true，
      //   语言切换瞬间 hasLoadedNamespace 返回 false 时组件会 throw Promise，
      //   无 <Suspense> 边界则整棵组件树崩溃。必须显式关闭。★
      react: { useSuspense: false },
    });
    i18nInstanceRef.current = instance;
    initPromiseRef.current = initPromise;
  }

  return (
    <I18nextProvider i18n={i18nInstanceRef.current}>
      <LocaleInner effectiveLocale={effectiveLocale} initPromise={initPromiseRef.current} i18nInstance={i18nInstanceRef.current}>{children}</LocaleInner>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
