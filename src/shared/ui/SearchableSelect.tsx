/**
 * 紧凑可搜索选择器
 * Compact Searchable Select
 *
 * @module shared/ui/SearchableSelect
 * @description 紧凑高度的可搜索下拉选择器，支持输入过滤。
 */

import { useState, useRef, useEffect, useMemo } from "react";
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
  placeholder = "请选择",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当前选中的选项
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // 过滤后的选项
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
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-secondary-50 px-2.5 py-1.5 cursor-pointer transition-colors",
          "hover:border-teal-300 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onClick={() => !disabled && handleFocus()}
      >
        <input
          ref={inputRef}
          type="text"
          value={open ? search : selected?.label ?? ""}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-secondary-400"
        />
        {selected && !open && (
          <button
            type="button"
            onClick={handleClear}
            className="text-secondary-400 hover:text-secondary-600 shrink-0"
          >
            <span className="text-xs">×</span>
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-48 rounded-lg border border-secondary-200 bg-white shadow-lg overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-secondary-400 text-center">无匹配</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt)}
                className={cn(
                  "w-full px-3 py-1.5 text-sm text-left hover:bg-teal-50 transition-colors",
                  opt.value === value && "bg-teal-50 text-teal-700 font-medium",
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

SearchableSelect.displayName = "SearchableSelect";
