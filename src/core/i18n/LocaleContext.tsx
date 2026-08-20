import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, type ReactNode } from "react";
import * as i18nModule from "i18next";
const i18n = (i18nModule as any).default || i18nModule;
import { initReactI18next, useTranslation } from "react-i18next";
import type { Locale, LocaleKey } from "./types";
import { SUPPORTED_LOCALE_CODES, getLocaleDir } from "./locales";
import { loadLanguage } from "./loader";

const STORAGE_KEY = "supply_os_locale";

function detectLocale(): Locale {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && (SUPPORTED_LOCALE_CODES as string[]).includes(stored)) {
            return stored as Locale;
        }
    } catch { /* localStorage unavailable */ }

    // 按用户偏好顺序遍历 navigator.languages（如 ["fr-CA", "fr", "en"]），
    // 返回首个受支持语言；navigator.languages 不可用时回退到单一 navigator.language。
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

/** 模块级初始化守卫，确保 setupI18nSync 只执行一次 */
let engineReady = false;

/**
 * 同步初始化 i18n 引擎（不加载语言资源）
 * Synchronous i18n engine setup — no language resources loaded.
 *
 * @description 配置 i18next 引擎并设置文档 lang/dir，但不 await 语言包下载。
 *              调用后 t() 即可返回 key 本身（不阻塞 React 渲染树挂载）。
 *              语言资源由 loadInitialLanguages() 异步加载完成后触发 re-render。
 */
export function setupI18nSync(): void {
  if (engineReady) return;
  engineReady = true;

  const initial = detectLocale();

  i18n
    .use(initReactI18next)
    .init({
      resources: {},
      lng: initial,
      fallbackLng: "en",
      interpolation: {
        escapeValue: false,
        prefix: "{",
        suffix: "}",
      },
      returnNull: false,
    });

  // 同步设置文档语言标记与书写方向
  if (typeof document !== "undefined") {
    document.documentElement.lang = initial;
    document.documentElement.dir = getLocaleDir(initial);
  }
}

/**
 * 异步加载初始语言包（当前语言 + 英文兜底）
 * Async load initial language bundles (current locale + English fallback).
 *
 * @description 在 React 树已挂载后调用，语言包下载完成后 i18next 自动触发
 *              组件 re-render，翻译文本替换 key 占位符。
 *              回滚：将此函数体合并回 initI18n() 并恢复 main.tsx 的 await 模式。
 */
export async function loadInitialLanguages(): Promise<void> {
  const initial = i18n.language as Locale || detectLocale();
  const langsToLoad: Locale[] = [initial];
  if (initial !== "en") langsToLoad.push("en");
  await Promise.all(langsToLoad.map(async (lang) => {
    const data = await loadLanguage(lang);
    if (Object.keys(data).length > 0) {
      i18n.addResourceBundle(lang, "translation", data, true, true);
    }
  }));
}

/**
 * @deprecated 使用 setupI18nSync() + loadInitialLanguages() 替代
 * 保留向后兼容：功能等同于两步合一
 */
export async function initI18n(): Promise<void> {
  setupI18nSync();
  await loadInitialLanguages();
}

type LocaleContextValue = {
    locale: Locale;
    localeDir: "ltr" | "rtl";
    setLocale: (next: Locale) => void;
    t: (key: LocaleKey, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
    // useTranslation 订阅语言变化，changeLanguage 时自动触发重渲染。
    const { t: translate, i18n: instance } = useTranslation();

    // P0 修复：语言包异步加载完成后触发 re-render
    // addResourceBundle 不会自动通知 react-i18next，需主动调用 changeLanguage
    // 回滚：删除 ready state + useEffect，恢复直接 {children}
    const [ready, setReady] = useState(false);

    useEffect(() => {
        loadInitialLanguages().then(() => {
            // 触发 react-i18next 重新渲染：changeLanguage 发射 languageChanged 事件
            instance.changeLanguage(instance.language);
            setReady(true);
        });
    }, [instance]);

    const locale = (instance.language as Locale) || "en";
    const localeDir = getLocaleDir(locale);

    const setLocale = useCallback(async (next: Locale) => {
        // 先加载目标语言资源（首次切换时下载对应 chunk），再切换语言
        const data = await loadLanguage(next);
        if (Object.keys(data).length > 0) {
          i18n.addResourceBundle(next, "translation", data, true, true);
        }
        // 确保英文兜底已加载（fallbackLng 依赖）
        if (next !== "en") {
          const enData = await loadLanguage("en");
          if (Object.keys(enData).length > 0) {
            i18n.addResourceBundle("en", "translation", enData, true, true);
          }
        }
        instance.changeLanguage(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch { /* ignore */ }
        if (typeof document !== "undefined") {
            document.documentElement.lang = next;
            document.documentElement.dir = getLocaleDir(next);
        }
    }, [instance]);

    const t = useCallback(
        (key: LocaleKey, params?: Record<string, string | number>): string =>
            translate(key, params) as string,
        [translate],
    );

    const value = useMemo<LocaleContextValue>(
        () => ({ locale, localeDir, setLocale, t }),
        [locale, localeDir, setLocale, t],
    );

    // 语言包未就绪时不渲染子树，避免闪烁翻译 key 占位符
    if (!ready) return null;

    // P2-1 性能修复：value useMemo（setLocale/t 已 useCallback，locale/localeDir 为原始值），
    // 避免每次渲染重建对象击穿所有 useLocale 消费组件的 memo
    return (
        <LocaleContext.Provider value={value}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
    return ctx;
}
