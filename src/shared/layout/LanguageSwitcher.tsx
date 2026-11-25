"use client";

/**
 * 语言选择下拉框
 * Language Switcher Dropdown
 *
 * @module shared/layout/LanguageSwitcher
 * @description 页头语言选择。下拉列出 7 种语言（联合国 6 种官方语言 + 葡语）。
 *              选中后统一写 Cookie 并原地加载语言包——**语言不改变 URL**：
 *              全站只有中文一份可索引内容（英文独立站已按 ADR-0024 下线），
 *              所以切换器不承担任何 SEO/路由职责，只切换界面语言。
 *              下拉定位用逻辑方向（end-0），RTL 下自动镜像。
 *              切换期间显示旋转指示器 + 禁用交互，防止重复点击。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, ChevronDown, Check, Loader2 } from "lucide-react";
import { useLocale, SUPPORTED_LOCALES } from "@/core/i18n";
import type { Locale } from "@/core/i18n";

export function LanguageSwitcher() {
  const { locale, switching, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current =
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  // 点击外部 / Esc 关闭（切换中不响应）
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
      if (switching) return; // 切换进行中忽略重复点击
      setOpen(false);
      // 语言只存在于 Cookie 与语言包，URL 不变——单语站（zh）不需要任何跳转
      void setLocale(code);
    },
    [setLocale, switching],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => { if (!switching) setOpen((v) => !v); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("uiSelectLanguage")}
        disabled={switching}
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
          switching
            ? "border-teal-300 bg-teal-50 text-teal-700 cursor-wait"
            : "border-slate-200 hover:bg-slate-50"
        }`}
      >
        {switching ? (
          <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-teal-600" />
        )}
        <span>{current.nativeName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("uiLanguageOptions")}
          className="absolute mt-1.5 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50 end-0 max-w-[calc(100vw-1rem)]"
        >
          {SUPPORTED_LOCALES.map((l) => {
            const selected = l.code === locale;
            return (
              <li key={l.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => handleSelect(l.code)}
                  dir={l.dir}
                  disabled={switching}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                    switching
                      ? "opacity-50 cursor-wait"
                      : "hover:bg-slate-50"
                  } ${
                    selected ? "font-semibold text-teal-700" : "text-slate-700"
                  }`}
                >
                  <span>{l.nativeName}</span>
                  {selected && !switching && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  {selected && switching && <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
