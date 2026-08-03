/**
 * 国家下拉展示组件（纯展示，无逻辑）
 * Country Dropdown Display Component (pure presentation)
 *
 * @module shared/filters/CountryDropdown
 */
import { getCountryDisplayName, getCountryEnglishName } from "@/shared/data/countryNames";
import type { CountryFilterItem } from "./CountryFilter";

export interface CountryDropdownProps {
  visible: CountryFilterItem[];
  placeholder: string;
  value: string;
  locale: string;
  onSelect: (country: string) => void;
  hasMore: boolean;
  filteredCount: number;
  maxVisible: number;
  noResultsText: string;
  moreResultsText: string;
}

export function CountryDropdown({
  visible, placeholder, value, locale, onSelect,
  hasMore, filteredCount, maxVisible,
  noResultsText, moreResultsText,
}: CountryDropdownProps) {
  return (
    <div className="absolute z-50 mt-1.5 w-[420px] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <ul className="max-h-[420px] overflow-y-auto py-2" role="listbox">
        <li
          role="option"
          aria-selected={!value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect("")}
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
            onClick={() => onSelect(item.country)}
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
          {filteredCount - maxVisible} {moreResultsText}
        </div>
      )}

      {visible.length === 0 && (
        <div className="px-4 py-5 text-sm text-slate-400 text-center">{noResultsText}</div>
      )}
    </div>
  );
}
