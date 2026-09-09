/**
 * 可搜索多选国家选择器
 * Searchable Multi-Select Country Picker
 *
 * @module shared/ui/CountryMultiSelect
 * @description 基于 world-countries（ISO 3166）官方数据，支持搜索过滤和多选。
 *              选中项以芯片形式展示，可单独删除。
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/shared/utils";
import countriesData, { type Country } from "world-countries";

interface CountryMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

interface CountryItem {
  /** ISO 3166-1 alpha-2 代码 */
  code: string;
  /** 英文通用名 */
  en: string;
  /** 中文通用名 */
  zh: string;
  /** 国旗 emoji */
  flag: string;
}

/** 从 world-countries 提取干净的国家列表（仅保留正式分配的国家） */
function buildCountryList(): CountryItem[] {
  return countriesData
    .filter((c) => c.status === "officially-assigned" || c.status === "user-assigned")
    .map((c: Country) => ({
      code: c.cca2,
      en: c.name.common,
      zh: c.translations.zho?.common ?? c.name.common,
      flag: c.flag,
    }))
    .sort((a, b) => a.zh.localeCompare(b.zh, "zh"));
}

const COUNTRY_LIST = buildCountryList();

export function CountryMultiSelect({
  value,
  onChange,
  placeholder = "请选择国家/地区",
  className,
}: CountryMultiSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 过滤国家列表
  const filtered = useMemo(() => {
    if (!search) return COUNTRY_LIST;
    const kw = search.toLowerCase();
    return COUNTRY_LIST.filter(
      (c) => c.zh.toLowerCase().includes(kw) || c.en.toLowerCase().includes(kw) || c.code.toLowerCase().includes(kw),
    );
  }, [search]);

  function toggleCountry(code: string) {
    if (value.includes(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      onChange([...value, code]);
    }
  }

  function removeCountry(code: string) {
    onChange(value.filter((v) => v !== code));
  }

  // 获取已选国家的显示信息
  function getCountryInfo(code: string): CountryItem | undefined {
    return COUNTRY_LIST.find((c) => c.code === code);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 已选国家芯片 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((code) => {
            const info = getCountryInfo(code);
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-700"
              >
                <span>{info?.flag}</span>
                {info?.zh || code}
                <button
                  type="button"
                  onClick={() => removeCountry(code)}
                  className="text-teal-500 hover:text-teal-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 搜索输入框 */}
      <div
        className="flex items-center gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2.5 cursor-pointer hover:border-teal-300 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Search className="w-4 h-4 text-secondary-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          placeholder={value.length > 0 ? `已选 ${value.length} 个，继续搜索…` : placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400"
          onClick={(e) => e.stopPropagation()}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-xs text-secondary-400 hover:text-secondary-600"
          >
            清除
          </button>
        )}
      </div>

      {/* 下拉列表 */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full max-h-72 rounded-lg border border-secondary-200 bg-white shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-secondary-400">
                无匹配结果
              </div>
            ) : (
              filtered.map((c) => {
                const selected = value.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:bg-teal-50 transition-colors",
                      selected && "bg-teal-50 text-teal-700 font-semibold",
                    )}
                  >
                    <span className="truncate flex items-center gap-2">
                      <span>{c.flag}</span>
                      <span>{c.zh}</span>
                      <span className="text-xs text-secondary-400 font-normal">{c.en}</span>
                    </span>
                    {selected && <span className="text-teal-600 text-xs">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

CountryMultiSelect.displayName = "CountryMultiSelect";
