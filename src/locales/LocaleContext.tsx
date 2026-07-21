import React, { createContext, useContext, useCallback, type ReactNode } from "react";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import type { Locale, LocaleKey } from "./types";
import zh from "./zh.json";
import en from "./en.json";

const STORAGE_KEY = "supply_os_locale";

function detectLocale(): Locale {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "zh" || stored === "en") return stored;
    } catch { /* localStorage unavailable */ }

    if (typeof navigator !== "undefined" && navigator.language) {
        const lang = navigator.language.toLowerCase();
        if (lang.startsWith("zh")) return "zh";
        if (lang.startsWith("en")) return "en";
    }

    return "zh";
}

// 初始化 react-i18next 引擎（模块级、仅一次；StrictMode 双调用由 isInitialized 守卫）。
// 插值配置对齐现有单花括号 `{param}` 语法，escapeValue: false 交由 React 转义（与旧实现行为一致）。
if (!i18n.isInitialized) {
    i18n
        .use(initReactI18next)
        .init({
            resources: {
                zh: { translation: zh },
                en: { translation: en },
            },
            lng: detectLocale(),
            fallbackLng: "zh",
            interpolation: {
                escapeValue: false,
                prefix: "{",
                suffix: "}",
            },
            returnNull: false,
        });
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
