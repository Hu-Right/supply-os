/**
 * 多语言上下文 — 初始 zh + 按需加载（Next.js App Router）
 *
 * @module core/i18n/LocaleContext
 * @description 初始 resources 只静态内联 zh（client-bundles.ts，2026-10 首屏
 *              分包改造 P0-1：旧版全 6 语言静态内联，每个路由首屏多背 ~700KB）。
 *              其余语言在「挂载检测」与「手动切换」两个入口经 loader.ts 动态
 *              import 懒加载 chunk，加载完成后 addResourceBundle 再切语言：
 *              未就绪前继续显示 zh（fallbackLng 同值），不出空字闪屏。
 *
 *              语言切换：locale 为 React state，t 函数由 getFixedT(locale) 驱动，
 *              不依赖 react-i18next v17 的 useSyncExternalStore 事件链。
 */
import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import * as i18nextModule from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { INITIAL_RESOURCES } from "./client-bundles";
import { loadLanguage, isLanguageLoaded } from "./loader";
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
  addResourceBundle: (lng: string, ns: string, resources: Record<string, string>, deep?: boolean, overwrite?: boolean) => void;
};

const COOKIE_NAME = "supply_os_locale";

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
  return "zh";
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
 * 确保目标语言的资源已注入实例：zh 初始即在内联 bundle 里；
 * 其余语言首次使用时拉懒加载 chunk 并 addResourceBundle。
 * 失败时抛给调用方（保持当前语言，不吞错）。
 */
async function ensureLocaleBundle(instance: I18nInstance, lang: Locale): Promise<void> {
  if (lang === "zh") return;
  if (!isLanguageLoaded(lang)) {
    const merged = await loadLanguage(lang);
    instance.addResourceBundle(lang, "translation", merged, true, true);
  }
}

/**
 * 内部组件：locale state + t 函数管理
 * zh 资源已静态注入；其余语言经 ensureLocaleBundle 懒加载后才切换 state。
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

  // ★ 客户端挂载后检测真实语言偏好（Cookie / navigator）；非 zh 时先拉对应
  // 语言包再切换，加载期间继续显示 zh（fallback），避免半翻译状态
  useEffect(() => {
    let cancelled = false;
    const detected = detectLocale();
    if (detected === locale) return;
    void (async () => {
      try {
        await ensureLocaleBundle(instance, detected);
        if (cancelled) return;
        setLocaleState(detected);
        await instance.changeLanguage(detected);
        if (cancelled) return;
        setCookie(COOKIE_NAME, detected, 365);
        if (typeof document !== "undefined") {
          document.documentElement.lang = detected;
          document.documentElement.dir = getLocaleDir(detected);
        }
      } catch (err) {
        console.error("[i18n] 初始语言包加载失败，保持默认语言:", detected, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // ★ 懒加载目标语言包，就绪后才切 state：语言包 chunk 下载失败时
    // 保持当前语言且不写 Cookie（切换中 LanguageSwitcher 已有 spinner 反馈）
    void (async () => {
      try {
        await ensureLocaleBundle(instance, next);
        await instance.changeLanguage(next);
        // ★ 显式更新 React state —— 保证 re-render，不依赖 useSyncExternalStore 事件链 ★
        setLocaleState(next);
        // ★ Cookie 持久化 ★（语言决议只读 cookie：本组件与 middleware.ts；
        // localStorage 双写是死代码，已移除——审查 F70）
        setCookie(COOKIE_NAME, next, 365);
        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
          document.documentElement.dir = getLocaleDir(next);
        }
      } catch (err) {
        console.error("[i18n] 语言包加载失败，切换中止:", next, err);
      } finally {
        setSwitching(false);
      }
    })();
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
  // ★ SSR 安全：initialLocale 未传入时统一使用 "zh"（主要客户为中文用户），
  // 避免 detectLocale() 在 SSR/CSR 返回不同值导致 hydration mismatch
  // 实际语言检测在客户端 useEffect 中完成
  const safeInitialLocale = initialLocale || "zh";
  const i18nInstanceRef = useRef<I18nInstance | null>(null);

  // ★ 创建独立 i18next 实例（仅一次），静态注入 zh 初始资源 ★
  if (!i18nInstanceRef.current) {
    const instance = createInstance();
    instance.use(initReactI18next).init({
      lng: safeInitialLocale,
      fallbackLng: "zh",
      resources: INITIAL_RESOURCES,
      interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
      returnNull: false,
      // 缺 key 时返回空串而非 key 本身：t(key) || 中文兜底 的写法才能生效，
      // 用户不会看到 detail_xxx 之类的裸 key。
      // 覆盖范围说明：因 fallbackLng="zh"，「某语言缺、zh 有」会静默回落到中文，
      // 这类键漂移由 scripts/check-i18n.ts 门禁拦截；此处告警专门兜另一种——
      // 代码引用了所有语言包（含 zh 兜底）都不存在的键，最终落到 t() 的 || 字面量。
      parseMissingKeyHandler: (key: string) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] 未在任何语言包中定义的键: "${key}"（页面将显示 t() 的 || 兜底文案）`);
        }
        return "";
      },
      react: { useSuspense: false },
    });
    i18nInstanceRef.current = instance;
  }

  return (
    <I18nextProvider i18n={i18nInstanceRef.current}>
      <LocaleInner effectiveLocale={safeInitialLocale} i18nInstance={i18nInstanceRef.current}>{children}</LocaleInner>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
