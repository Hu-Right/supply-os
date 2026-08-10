/**
 * 搜索下拉数据源 Hook（国家/机构列表 + sessionStorage 缓存）
 * Search dropdown data sources with sessionStorage caching
 *
 * @module features/procurement/hooks/useSearchDropdowns
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { fetchNoticeCountries, fetchNoticeAgencies } from "../api";

const COUNTRIES_CACHE_KEY = "supply-os:notice-countries";
const AGENCIES_CACHE_KEY = "supply-os:notice-agencies";
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟

function readSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}
function writeSessionCache(key: string, data: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}

export function useSearchDropdowns() {
  const { locale } = useLocale();
  const [countries, setCountries] = useState<Array<{ country: string; count: number }>>([]);
  const [agencies, setAgencies] = useState<Array<{ agency: string; count: number }>>([]);

  // 国家下拉数据源（sessionStorage 缓存优先）
  useEffect(() => {
    const cached = readSessionCache<Array<{ country: string; count: number }>>(COUNTRIES_CACHE_KEY);
    if (cached) { setCountries(cached); return; }
    fetchNoticeCountries()
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setCountries(arr);
        if (arr.length > 0) writeSessionCache(COUNTRIES_CACHE_KEY, arr);
      })
      .catch(() => setCountries([]));
  }, []);

  // 采购机构下拉数据源（sessionStorage 缓存优先，按 locale 分键）
  useEffect(() => {
    const cacheKey = `${AGENCIES_CACHE_KEY}:${locale}`;
    const cached = readSessionCache<Array<{ agency: string; count: number }>>(cacheKey);
    if (cached) { setAgencies(cached); return; }
    fetchNoticeAgencies(locale)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setAgencies(arr);
        if (arr.length > 0) writeSessionCache(cacheKey, arr);
      })
      .catch(() => setAgencies([]));
  }, [locale]);

  return { countries, agencies };
}
