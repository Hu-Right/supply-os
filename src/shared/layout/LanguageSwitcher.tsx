/**
 * 语言选择下拉框
 * Language Switcher Dropdown
 *
 * @module shared/layout/LanguageSwitcher
 * @description 页头语言选择。下拉列出 7 种语言（联合国 6 种官方语言 + 葡语）。
 *              选中后统一写 Cookie 并原地加载语言包；只有从 /en 回中文等
 *              “URL 前缀归属不同”的场景才做导航。英文 SEO 站（/en）保留给
 *              搜索引擎/外链，不再由语言切换器跳入。
 *              下拉定位用逻辑方向（end-0），RTL 下自动镜像。
 *              切换期间显示旋转指示器 + 禁用交互，防止重复点击。
 *              Header language selector: 7 languages; all locales switch in place via
 *              cookie. Only navigate when leaving the separate /en SEO root.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Globe, ChevronDown, Check, Loader2 } from "lucide-react";
import { useLocale, SUPPORTED_LOCALES, localeHref } from "@/core/i18n";
import type { Locale } from "@/core/i18n";

export function LanguageSwitcher() {
  const { locale, switching, setLocale, t } = useLocale();
  const router = useRouter();
  const pathname = usePathname() || "/";
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
      const href = localeHref(pathname, code);

      // 所有语言统一：先切语言（写 Cookie、加载语言包），再按需导航。
      // /en 的英文 SEO 站不再由切换器进入；只有从 /en 回中文/其他语言时才导航。
      void (async () => {
        await setLocale(code);
        if (href && href !== pathname) router.push(href);
      })();
    },
    [pathname, router, setLocale, switching],
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
