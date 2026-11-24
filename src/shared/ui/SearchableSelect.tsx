/**
 * 紧凑可搜索选择器
 * Compact Searchable Select
 *
 * @description 紧凑高度的可搜索下拉选择器，支持输入过滤。
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { cn } from "@/shared/utils";

interface SearchableSelectOption {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
}: SearchableSelectProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    const kw = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(kw));
  }, [options, search]);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(opt: SearchableSelectOption) {
    onChange(opt.value);
    setOpen(false);
    setSearch("");
  }

  function handleFocus() {
    if (!disabled) {
      setOpen(true);
      inputRef.current?.select();
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSearch("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-lg border border-secondary-200 bg-white px-3 shadow-xs transition-[border-color,box-shadow]",
          "hover:border-secondary-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => !disabled && handleFocus()}
      >
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          value={open ? search : selected?.label ?? ""}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder ?? t("selectUiPlaceholder")}
          disabled={disabled}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent text-sm text-secondary-900 no-focus-outline placeholder:text-secondary-400"
        />
        {selected && !open ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("selectUiClear")}
            className="shrink-0 rounded p-0.5 text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-secondary-400 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </div>

      {open && !disabled && (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-secondary-200 bg-white p-1.5 shadow-xl shadow-secondary-950/10"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-secondary-400">{t("selectUiNoMatch")}</div>
          ) : (
            filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm transition-colors",
                    active
                      ? "bg-primary-50 font-medium text-primary-700"
                      : "text-secondary-700 hover:bg-secondary-50",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-primary-600" /> : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

SearchableSelect.displayName = "SearchableSelect";
