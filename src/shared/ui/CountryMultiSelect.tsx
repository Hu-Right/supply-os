/**
 * 可搜索多选国家选择器
 * Searchable Multi-Select Country Picker
 *
 * @module shared/ui/CountryMultiSelect
 * @description 从服务端 API 获取国家列表，支持搜索过滤和多选。
 *              选中项以芯片形式展示，可单独删除。
 */

import { useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/core/http";
import { cn } from "@/shared/utils";

interface CountryMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

interface CountryItem {
  en: string;
  zh: string;
}

export function CountryMultiSelect({
  value,
  onChange,
  placeholder = "请选择国家/地区",
  className,
}: CountryMultiSelectProps) {
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取国家列表
  useEffect(() => {
    let cancelled = false;
    api<{ countries: Record<string, string>; zhToEn: Record<string, string> }>(
      "/api/catalog/country-name-map",
    )
      .then((data) => {
        if (cancelled) return;
        const list: CountryItem[] = Object.entries(data.countries || {}).map(([en, zh]) => ({
          en,
          zh,
        }));
        // 按中文名排序
        list.sort((a, b) => a.zh.localeCompare(b.zh, "zh"));
        setCountries(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
  const filtered = countries.filter((c) => {
    if (!search) return true;
    const kw = search.toLowerCase();
    return c.zh.toLowerCase().includes(kw) || c.en.toLowerCase().includes(kw);
  }).slice(0, 100); // 限制显示数量

  function toggleCountry(en: string) {
    if (value.includes(en)) {
      onChange(value.filter((v) => v !== en));
    } else {
      onChange([...value, en]);
    }
  }

  function removeCountry(en: string) {
    onChange(value.filter((v) => v !== en));
  }

  // 获取已选国家的中文名
  function getCountryZh(en: string): string {
    const c = countries.find((x) => x.en === en);
    return c?.zh || en;
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 已选国家芯片 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((en) => (
            <span
              key={en}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-700"
            >
              {getCountryZh(en)}
              <button
                type="button"
                onClick={() => removeCountry(en)}
                className="text-teal-500 hover:text-teal-700"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
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
                const selected = value.includes(c.en);
                return (
                  <button
                    key={c.en}
                    type="button"
                    onClick={() => toggleCountry(c.en)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:bg-teal-50 transition-colors",
                      selected && "bg-teal-50 text-teal-700 font-semibold",
                    )}
                  >
                    <span className="truncate">
                      {c.zh}
                      <span className="text-xs text-secondary-400 ml-1.5 font-normal">{c.en}</span>
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
