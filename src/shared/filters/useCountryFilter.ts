/**
 * CountryFilter 逻辑 Hook
 * Country Filter Logic Hook
 *
 * @module shared/filters/useCountryFilter
 * @description 封装搜索过滤、焦点管理、键盘导航、外部点击关闭等逻辑，
 *              CountryFilter 主体组件仅负责组合渲染。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import type { CountryFilterItem } from "./CountryFilter";

/** 下拉列表最大渲染条数（防止 DOM 节点过多影响性能） */
const MAX_VISIBLE = 200;

export interface UseCountryFilterParams {
  countries: CountryFilterItem[];
  value: string;
  onChange: (country: string) => void;
  locale: string;
  placeholder: string;
}

export function useCountryFilter({
  countries, value, onChange, locale, placeholder,
}: UseCountryFilterParams) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [hasSelected, setHasSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  // hasSelected/value 的最新快照：onFocus 读此 ref 而非闭包
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

  const visible = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  const selectedCountry = countries.find((c) => c.country === value);
  const displayCountryName = selectedCountry ? getCountryDisplayName(value, locale) : "";
  const inputValue = focused ? query : (hasSelected && value ? displayCountryName : "");

  const handleSelect = (country: string) => {
    onChange(country);
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
      setQuery(displayCountryName);
    }
  };

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      setFocused(false);
      setQuery("");
    }, 150);
  };

  return {
    containerRef, inputRef, showDropdown,
    visible, hasMore, filteredCount: filtered.length,
    inputValue, displayCountryName,
    handleSelect, handleClear, handleFocus, handleBlur,
    setQuery, setFocused,
  };
}
