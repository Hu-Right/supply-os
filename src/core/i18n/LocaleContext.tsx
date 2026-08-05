import React, { createContext, useContext, useCallback, type ReactNode } from "react";
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

/** 模块级初始化守卫，确保 initI18n 只执行一次 */
let initialized = false;

/**
 * 异步初始化 i18n：仅加载当前语言 + 英文兜底
 * 由 main.tsx 在首次渲染前 await 调用
 */
export async function initI18n(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const initial = detectLocale();

  // i18next 引擎配置（无静态资源——资源由 loader.ts 按需注入）
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

  // 并行加载当前语言 + 英文兜底（首屏仅需 ~36-55KB 而非 256KB）
  const langsToLoad: Locale[] = [initial];
  if (initial !== "en") langsToLoad.push("en");
  await Promise.all(langsToLoad.map(async (lang) => {
    const data = await loadLanguage(lang);
    if (Object.keys(data).length > 0) {
      i18n.addResourceBundle(lang, "translation", data, true, true);
    }
  }));

  // 首屏同步文档语言标记与书写方向：阿语设全局 dir="rtl"
  if (typeof document !== "undefined") {
    document.documentElement.lang = initial;
    document.documentElement.dir = getLocaleDir(initial);
  }
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

    return (
        <LocaleContext.Provider value={{ locale, localeDir, setLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
    return ctx;
}
