/**
 * 采购机构筛选组件（搜索框 + 自动下拉）
 * Agency Filter Component
 *
 * @module shared/filters/AgencyFilter
 * @description 参考 CountryFilter 模式，用于采购机构名称的可搜索下拉筛选。
 *              支持 i18n：优先展示 agency_i18n（本地化翻译名），回退到 agency（英文原名）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useLocale } from "@/core/i18n";

export interface AgencyFilterItem { agency: string; count: number; agency_i18n?: string; }

export interface AgencyFilterProps {
  agencies: AgencyFilterItem[];
  value: string;
  onChange: (agency: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  className?: string;
}

export function AgencyFilter({
  agencies, value, onChange,
  placeholder = "All agencies",
  searchPlaceholder = "Search agency...",
  noResultsText,
  className = "",
}: AgencyFilterProps) {
  const { t } = useLocale();
  const resolvedNoResults = noResultsText ?? t("filterNoMatchAgencies");
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [hasSelected, setHasSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const selectedStateRef = useRef({ hasSelected: false, value: "" });

  useEffect(() => {
    selectedStateRef.current = { hasSelected, value };
  });

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

  // 前端过滤：按机构名搜索（不区分大小写，同时匹配翻译名）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter((a) =>
      a.agency.toLowerCase().includes(q) ||
      (a.agency_i18n && a.agency_i18n.toLowerCase().includes(q))
    );
  }, [agencies, query]);

  const selectedAgency = agencies.find((a) => a.agency === value);
  // 优先展示翻译名，回退到英文原名
  const displayAgencyName = selectedAgency
    ? (selectedAgency.agency_i18n || selectedAgency.agency)
    : "";
  const inputValue = focused ? query : (hasSelected && value ? displayAgencyName : "");

  const handleSelect = (agency: string) => {
    onChange(agency);
    setQuery("");
    setHasSelected(true);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    selectedStateRef.current = { hasSelected: false, value: "" };
    onChange("");
    setQuery("");
    setHasSelected(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setFocused(true);
    const latest = selectedStateRef.current;
    if (latest.hasSelected && latest.value && !query) {
      setQuery(displayAgencyName);
    }
  };

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      setFocused(false);
      setQuery("");
    }, 150);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          dir="auto"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          className="w-full ps-9 pe-8 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors"
        />
        {(value || inputValue) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label={t("filterClearAgency")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <ul className="max-h-[360px] overflow-y-auto py-2" role="listbox">
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
            {filtered.map((item) => (
              <li
                key={item.agency}
                role="option"
                aria-selected={value === item.agency}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item.agency)}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                  value === item.agency
                    ? "bg-teal-50 text-teal-700 font-semibold"
                    : "text-slate-700 hover:bg-teal-50"
                }`}
              >
                <span className="truncate" dir="auto">{item.agency_i18n || item.agency}</span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{item.count}</span>
              </li>
            ))}
          </ul>

          {filtered.length === 0 && (
            <div className="px-4 py-5 text-sm text-slate-400 text-center">{resolvedNoResults}</div>
          )}
        </div>
      )}
    </div>
  );
}

AgencyFilter.displayName = "AgencyFilter";
