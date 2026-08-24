/**
 * 语言选择下拉框
 * Language Switcher Dropdown
 *
 * @module shared/layout/LanguageSwitcher
 * @description 页头语言选择。点击展开下拉，列出联合国 6 种官方语言，点击切换。
 *              下拉面板始终向左展开（物理 right:0 定位），不受文档方向影响。
 *              Header language selector: click to open a dropdown listing the 6
 *              UN official languages; selecting one switches the locale.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";
import { useLocale, SUPPORTED_LOCALES } from "@/core/i18n";
import type { Locale } from "@/core/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current =
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback(
    (code: Locale) => {
      setLocale(code);
      setOpen(false);
    },
    [setLocale],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("uiSelectLanguage")}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium cursor-pointer"
      >
        <Globe className="w-3.5 h-3.5 text-teal-600" />
        <span>{current.nativeName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("uiLanguageOptions")}
          className="absolute mt-1.5 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50 right-0 max-w-[calc(100vw-1rem)]"
        >
          {SUPPORTED_LOCALES.map((l) => {
            const selected = l.code === locale;
            return (
              <li key={l.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => handleSelect(l.code)}
                  dir={l.dir}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${
                    selected ? "font-semibold text-teal-700" : "text-slate-700"
                  }`}
                >
                  <span>{l.nativeName}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
