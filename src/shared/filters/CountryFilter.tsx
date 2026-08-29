/**
 * 增强版国家筛选组件（搜索框 + 自动下拉）
 * @module shared/filters/CountryFilter
 */
import { Search, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useCountryFilter } from "./useCountryFilter";
import { CountryDropdown } from "./CountryDropdown";

export interface CountryFilterItem { country: string; count: number; }

export interface CountryFilterProps {
  countries: CountryFilterItem[];
  value: string;
  onChange: (country: string) => void;
  locale?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  className?: string;
}

export function CountryFilter({
  countries, value, onChange,
  locale = "en", placeholder = "All countries",
  noResultsText,
  className = "",
}: CountryFilterProps) {
  const { t } = useLocale();
  const resolvedNoResults: string = noResultsText ?? t("filterNoMatchCountries");
  const {
    containerRef, inputRef, showDropdown,
    visible,
    inputValue,
    handleSelect, handleClear, handleFocus, handleBlur,
    setQuery, setFocused,
  } = useCountryFilter({ countries, value, onChange, locale, placeholder });

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
            aria-label={t("filterClearCountry")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <CountryDropdown
          visible={visible} placeholder={placeholder} value={value} locale={locale}
          onSelect={handleSelect} noResultsText={resolvedNoResults}
        />
      )}
    </div>
  );
}

CountryFilter.displayName = "CountryFilter";
