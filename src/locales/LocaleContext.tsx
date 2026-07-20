import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Locale, LocaleKey } from "./types";
import zh from "./zh.json";
import en from "./en.json";

const translations: Record<Locale, Record<LocaleKey, string>> = { zh, en };

function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem("supply_os_locale");
    if (stored === "zh" || stored === "en") return stored;
  } catch { /* localStorage unavailable */ }

  if (typeof navigator !== "undefined" && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("en")) return "en";
  }

  return "zh";
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: LocaleKey, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem("supply_os_locale", next);
    } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: LocaleKey, params?: Record<string, string | number>): string => {
      const dict = translations[locale];
      let text = dict[key] ?? translations.zh[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
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
