/**
 * UNSPSC 类目 API
 * UNSPSC category API
 *
 * @module core/unspsc/api
 * @description UNSPSC 类目获取（跨 auth/procurement/training 模块共用的领域服务）。
 *              自 features/procurement/api 上移；Task 5 将把 fetchJsonCached 统一为 core/http 的 apiCached。
 */
import type { UnspscOption } from "./types";

const apiCache = new Map<string, Promise<any>>();

const fetchJsonCached = <T,>(url: string): Promise<T> => {
  const cached = apiCache.get(url);
  if (cached) return cached;

  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });
  apiCache.set(url, request);
  request.catch(() => apiCache.delete(url));
  return request;
};

// 需要向后端请求译文的界面语言（zh/en 直接用类目表原列，不传 lang）
const UNSPSC_API_LANGS = new Set(["fr", "ru", "es", "ar"]);

export const fetchUnspscIndustries = (locale?: string) => {
  const lang = locale && UNSPSC_API_LANGS.has(locale) ? `?lang=${encodeURIComponent(locale)}` : "";
  return fetchJsonCached<UnspscOption[]>(`/api/unspsc/industries${lang}`);
};

export const fetchUnspscChildren = (parentId: string, locale?: string) => {
  const searchParams = new URLSearchParams({ parent_id: parentId });
  if (locale && UNSPSC_API_LANGS.has(locale)) searchParams.set("lang", locale);
  return fetchJsonCached<UnspscOption[]>(`/api/unspsc/children?${searchParams.toString()}`);
};
