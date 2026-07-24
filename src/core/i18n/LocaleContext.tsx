import React, { createContext, useContext, useCallback, type ReactNode } from "react";
import * as i18nModule from "i18next";
const i18nInstance = (i18nModule as any).default || i18nModule;
import { initReactI18next, useTranslation } from "react-i18next";
import type { Locale, LocaleKey } from "./types";
import { SUPPORTED_LOCALE_CODES } from "./locales";
import zh from "./zh.json";
import en from "./en.json";
import fr from "./fr.json";
import ru from "./ru.json";
import es from "./es.json";
import ar from "./ar.json";

const STORAGE_KEY = "supply_os_locale";

function detectLocale(): Locale {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && (SUPPORTED_LOCALE_CODES as string[]).includes(stored)) {
            return stored as Locale;
        }
    } catch { /* localStorage unavailable */ }

    if (typeof navigator !== "undefined" && navigator.language) {
        const lang = navigator.language.toLowerCase();
        const matched = SUPPORTED_LOCALE_CODES.find((code) => lang.startsWith(code));
        if (matched) return matched;
    }

    return "zh";
}

// 初始化 react-i18next 引擎（模块级、仅一次；StrictMode 双调用由 isInitialized 守卫）。
// 插值配置对齐现有单花括号 `{param}` 语法，escapeValue: false 交由 React 转义（与旧实现行为一致）。
// fallbackLng 设为 "en"：缺 key 时回退英文（国际化通用做法，英文为兜底 lingua franca）。
if (!i18nInstance.isInitialized) {
    i18nInstance
        .use(initReactI18next)
        .init({
            resources: {
                zh: { translation: zh },
                en: { translation: en },
                fr: { translation: fr },
                ru: { translation: ru },
                es: { translation: es },
                ar: { translation: ar },
            },
            lng: detectLocale(),
            fallbackLng: "en",
            interpolation: {
                escapeValue: false,
                prefix: "{",
                suffix: "}",
            },
            returnNull: false,
        });
}

// 首屏同步文档语言标记（不再全局设置 dir="rtl"，避免 Tailwind 逻辑属性翻转页面布局）
if (typeof document !== "undefined") {
    const initial = i18nInstance.language as Locale;
    document.documentElement.lang = initial;
}

type LocaleContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: LocaleKey, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
    // useTranslation 订阅语言变化，changeLanguage 时自动触发重渲染。
    const { t: translate, i18n: instance } = useTranslation();

    const locale = (instance.language as Locale) || "zh";

    const setLocale = useCallback((next: Locale) => {
        instance.changeLanguage(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch { /* ignore */ }
        if (typeof document !== "undefined") {
            document.documentElement.lang = next;
        }
    }, [instance]);

    const t = useCallback(
        (key: LocaleKey, params?: Record<string, string | number>): string =>
            translate(key, params) as string,
        [translate],
    );

    return (
        <LocaleContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
    return ctx;
}
