/**
 * 增强版国家筛选组件（搜索框 + 自动下拉）
 * Enhanced Country Filter Component (Search Input + Autocomplete Dropdown)
 *
 * @module shared/filters/CountryFilter
 * @description 以搜索输入框为主体，聚焦/输入时自动弹出国家下拉列表，
 *              支持实时过滤，突破原有 100 国限制。
 *              Search-input-first design: focus or type to reveal a
 *              country dropdown with live filtering.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { getCountryDisplayName, getCountryEnglishName } from "@/shared/data/countryNames";

export interface CountryFilterItem {
  country: string;
  count: number;
}

export interface CountryFilterProps {
  /** 全量国家列表（来自 /api/notices/countries） */
  countries: CountryFilterItem[];
  /** 当前选中国家名称（空串 = 全部国家，值为英文原名） */
  value: string;
  /** 选中变更回调（回传英文原名） */
  onChange: (country: string) => void;
  /** 当前语言环境（用于国家名中文化） */
  locale?: string;
  /** 占位文本（i18n） */
  placeholder?: string;
  /** 搜索框占位文本（i18n） */
  searchPlaceholder?: string;
  /** 无结果提示文本（i18n） */
  noResultsText?: string;
  /** 更多结果提示文本（i18n） */
  moreResultsText?: string;
  /** 自定义类名 */
  className?: string;
}

/** 下拉列表最大渲染条数（防止 DOM 节点过多影响性能） */
const MAX_VISIBLE = 200;

export function CountryFilter({
  countries,
  value,
  onChange,
  locale = "en",
  placeholder = "All countries",
  searchPlaceholder = "Search country...",
  noResultsText = "No matching countries",
  moreResultsText = "more results — refine your search",
  className = "",
}: CountryFilterProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [hasSelected, setHasSelected] = useState(false); // 用户是否主动选中过（区分 URL 初始值 vs 用户选择）
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // onBlur 延迟关闭的定时器；清除时须先行取消，避免其延迟回调在清除后再次重置状态造成显示闪烁
  const blurTimerRef = useRef<number | null>(null);
  // hasSelected/value 的最新快照：onFocus 读此 ref 而非闭包，
  // 避免 handleClear 中 focus() 触发 onFocus 时读到清除前的旧状态、把国家名重新填回输入框
  const selectedStateRef = useRef({ hasSelected: false, value: "" });
  useEffect(() => {
    selectedStateRef.current = { hasSelected, value };
  });

  // 下拉是否可见：聚焦时显示
  const showDropdown = focused;

  // 点击外部关闭下拉
  useEffect(() => {
    if (!focused) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  // ESC 关闭
  useEffect(() => {
    if (!focused) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocused(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focused]);

  // 前端过滤：支持按英文名和中文名同时搜索
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => {
      const en = c.country.toLowerCase();
      const zh = getCountryDisplayName(c.country, "zh").toLowerCase();
      return en.includes(q) || zh.includes(q);
    });
  }, [countries, query]);

  // 性能保护：超过 MAX_VISIBLE 时截断
  const visible = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  // 输入框显示值：
  // - 聚焦中 → 显示 query（用户正在输入）
  // - 失焦 + 用户主动选中过 → 显示选中国家名
  // - 失焦 + 未选中过 → 空（placeholder）
  const selectedCountry = countries.find((c) => c.country === value);
  const displayCountryName = selectedCountry ? getCountryDisplayName(value, locale) : "";
  const inputValue = focused ? query : (hasSelected && value ? displayCountryName : "");

  const handleSelect = (country: string) => {
    onChange(country);
    setQuery("");
    setHasSelected(true); // 用户主动选中
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    // 取消 onBlur 遗留的延迟关闭定时器，防止清除后下拉被意外收起、query 被二次重置
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    // 同步刷新状态快照：下方 focus() 触发的 onFocus 将读到"已清除"，不会回填国家名
    selectedStateRef.current = { hasSelected: false, value: "" };
    onChange("");
    setQuery("");
    setHasSelected(false); // 清除选中，回到初始态
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* 搜索输入框（主体） */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(true);
          }}
          onFocus={() => {
            setFocused(true);
            // 聚焦时若已选中，将选中值填入 query 供编辑（读 ref 避免清除后立即聚焦时回填旧值）
            const latest = selectedStateRef.current;
            if (latest.hasSelected && latest.value && !query) {
              setQuery(displayCountryName);
            }
          }}
          onBlur={() => {
            // 延迟关闭，让 click 事件先触发
            blurTimerRef.current = window.setTimeout(() => {
              blurTimerRef.current = null;
              setFocused(false);
              setQuery(""); // 失焦清空，下次聚焦重新填入
            }, 150);
          }}
          placeholder={placeholder}
          dir="auto"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          className="w-full ps-9 pe-8 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors"
        />
        {/* 清除按钮 */}
        {(value || query) && (
          <button
            type="button"
            // 阻止 mousedown 默认行为：点击清除按钮不触发输入框失焦，
            // 清除得以立即生效（否则会走 onBlur 的 150ms 延迟，表现为"失焦后才清空"）
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Clear country filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 下拉列表 */}
      {showDropdown && (
        <div className="absolute z-50 mt-1.5 w-[420px] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <ul className="max-h-[420px] overflow-y-auto py-2" role="listbox">
            {/* 全部国家 */}
            <li
              role="option"
              aria-selected={!value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect("")}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                !value ? "bg-teal-50 text-teal-700 font-semibold" : "text-slate-700 hover:bg-teal-50"
              }`}
            >
              {placeholder}
            </li>
            {visible.map((item) => (
              <li
                key={item.country}
                role="option"
                aria-selected={value === item.country}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item.country)}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                  value === item.country
                    ? "bg-teal-50 text-teal-700 font-semibold"
                    : "text-slate-700 hover:bg-teal-50"
                }`}
              >
                <span className="truncate flex items-center gap-2" dir="auto">
                  <span>{getCountryDisplayName(item.country, locale)}</span>
                  {locale === "zh" && getCountryEnglishName(item.country) !== getCountryDisplayName(item.country, "zh") && (
                    <span className="text-xs text-slate-400 font-normal">{getCountryEnglishName(item.country)}</span>
                  )}
                </span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{item.count}</span>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 bg-slate-50 text-center">
              {filtered.length - MAX_VISIBLE} {moreResultsText}
            </div>
          )}

          {visible.length === 0 && (
            <div className="px-4 py-5 text-sm text-slate-400 text-center">{noResultsText}</div>
          )}
        </div>
      )}
    </div>
  );
}

CountryFilter.displayName = "CountryFilter";
