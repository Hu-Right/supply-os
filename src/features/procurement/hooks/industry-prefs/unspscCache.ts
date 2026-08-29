/**
 * UNSPSC 一级类目 sessionStorage 缓存工具
 * UNSPSC Level-1 Category Session Storage Cache Utilities
 *
 * @module features/procurement/hooks/industry-prefs/unspscCache
 * @description 纯函数，无 React 依赖，可独立单测。
 *              10 分钟 TTL，按 locale 分键，与国家/机构下拉缓存策略一致。
 */
import type { UnspscOption } from "../../types";

const UNSPSC_INDUSTRIES_CACHE_KEY = "supply-os:unspsc-industries";
const UNSPSC_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

export function readUnspscCache(locale: string): UnspscOption[] | null {
  try {
    const raw = sessionStorage.getItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > UNSPSC_CACHE_TTL) {
      sessionStorage.removeItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`);
      return null;
    }
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

export function writeUnspscCache(locale: string, data: UnspscOption[]): void {
  try {
    sessionStorage.setItem(`${UNSPSC_INDUSTRIES_CACHE_KEY}:${locale}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}
