/**
 * 搜索下拉数据源 Hook（国家列表 + sessionStorage 缓存）
 * Search dropdown data sources with sessionStorage caching
 *
 * [2026-10-29] 采购机构/买家筛选已下架（买家数据做完整后再恢复），
 * 机构下拉数据源与 fetchNoticeAgencies 一并移除。
 *
 * @module features/procurement/hooks/useSearchDropdowns
 */
import { useEffect, useState } from "react";
import { fetchNoticeCountries } from "../api";

const COUNTRIES_CACHE_KEY = "supply-os:notice-countries";
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
  const [countries, setCountries] = useState<Array<{ country: string; count: number }>>([]);

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

  return { countries };
}
